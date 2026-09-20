"use client";

import { useEffect, useRef, useState } from "react";
import {
  AGENT_SAMPLE_RATE,
  LinearResampler,
  PcmPlayer,
  floatTo16BitPCM,
} from "@/lib/audio";
import { AGENT_WS_URL, buildAgentSettings } from "@/lib/agent-settings";
import VizCanvas from "@/components/viz/VizCanvas";
import { applyVizUpdate, describeVizDelta, summarizeViz } from "@/lib/viz/normalize";
import { buildSystemPrompt } from "@/lib/prompt";
import {
  DEFAULT_VIZ_STORE,
  MISCONCEPTION_LABELS,
  type Concept,
  type VizStore,
} from "@/lib/viz/types";

type Understanding = { stillPresent: boolean; confidence?: string; miscId?: string } | null;

type Status = "idle" | "connecting" | "connected" | "error";
type Line = { role: "user" | "assistant" | "system" | "action"; text: string };

// Dev-harness presets — same arg shape the LLM will send via
// update_visualization, so this exercises the real Phase-3 code path.
const DEV_PRESETS: { label: string; args: unknown }[] = [
  {
    label: "recursion · m1 (overwrites state)",
    args: {
      concept: "recursion",
      misconception_id: "recursion_m1",
      viz_state: { function_name: "fibonacci", input: 5, active_frame_id: 3 },
      narration_hint: "paused frames still waiting on the stack",
    },
  },
  {
    label: "recursion · m2 (depth vs calls)",
    args: {
      concept: "recursion",
      misconception_id: "recursion_m2",
      viz_state: { function_name: "fibonacci", input: 6 },
      narration_hint: "watch how many calls this actually makes",
    },
  },
  {
    label: "sorting · m1 (parallel compares)",
    args: {
      concept: "sorting",
      misconception_id: "sorting_m1",
      viz_state: { algorithm: "bubble", array: [5, 3, 8, 1, 6, 2, 7, 4], step_index: 2 },
      narration_hint: "comparisons happen one at a time",
    },
  },
  {
    label: "sorting · m2 (every compare swaps)",
    args: {
      concept: "sorting",
      misconception_id: "sorting_m2",
      viz_state: { algorithm: "insertion", array: [9, 4, 7, 2, 8, 3], playing: true },
      narration_hint: "most comparisons don't swap",
    },
  },
  {
    label: "derivative · m1 (f′ = value?)",
    args: {
      concept: "derivative",
      misconception_id: "derivative_m1",
      viz_state: { function: "x^2", point_x: 2, secant_dx: 0, show_fx_panel: true },
      narration_hint: "the two curves are different things",
    },
  },
  {
    label: "derivative · m2 (secant→tangent)",
    args: {
      concept: "derivative",
      misconception_id: "derivative_m2",
      viz_state: { function: "x^3", point_x: 1.5, secant_dx: 2.5, show_fx_panel: true },
      narration_hint: "watch h shrink to zero",
    },
  },
];

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark"
  );
  const [viz, setViz] = useState<VizStore>(DEFAULT_VIZ_STORE);
  const [understanding, setUnderstanding] = useState<Understanding>(null);
  const [muted, setMuted] = useState(false);
  const [devMode] = useState(
    () => typeof window !== "undefined" && window.location.search.includes("dev=1")
  );



  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* private mode */
    }
  };

  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const vizRef = useRef<VizStore>(DEFAULT_VIZ_STORE);
  const vizUndoRef = useRef<VizStore | null>(null);
  const promptSyncRef = useRef<number | null>(null);
  const lastActionVizRef = useRef<VizStore>(DEFAULT_VIZ_STORE);
  const pendingTextRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const logRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // single funnel for all viz writes — keeps a ref mirror for WS handlers and
  // a one-deep undo for cancelled function calls
  const writeViz = (next: VizStore, undoable = false) => {
    if (undoable) vizUndoRef.current = vizRef.current;
    vizRef.current = next;
    setViz(next);
  };

  // Committed student edits: silently resend the prompt's CURRENT STATE
  // footer so the agent always knows the screen, and — for salient actions
  // (dragged h, switched algorithm, shuffled…) — inject a bracketed note so
  // it can react. Debounced; a burst of slider releases becomes one note.
  const handleVizCommit = () => {
    if (promptSyncRef.current) window.clearTimeout(promptSyncRef.current);
    promptSyncRef.current = window.setTimeout(() => {
      const cur = vizRef.current;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        lastActionVizRef.current = cur;
        return;
      }
      ws.send(JSON.stringify({ type: "UpdatePrompt", prompt: buildSystemPrompt(cur) }));
      const desc = describeVizDelta(lastActionVizRef.current, cur);
      lastActionVizRef.current = cur;
      if (desc) {
        ws.send(
          JSON.stringify({ type: "InjectUserMessage", content: `[The student ${desc}]` })
        );
      }
    }, 800);
  };

  const pushLine = (role: Line["role"], text: string) =>
    setLines((prev) => {
      // "[The student …]" injections echo back as user messages — render them
      // as action notes, not speech the student typed
      const action = role === "user" ? text.match(/^\[The student (.+)\]$/) : null;
      const effRole: Line["role"] = action ? "action" : role;
      const effText = action ? `you ${action[1]}` : text;
      // ConversationText arrives as streamed fragments — merge consecutive
      // chunks of the same speaker into one line
      const last = prev[prev.length - 1];
      if (last && last.role === effRole && (effRole === "user" || effRole === "assistant")) {
        return [...prev.slice(0, -1), { role: effRole, text: `${last.text} ${effText}` }];
      }
      return [...prev.slice(-99), { role: effRole, text: effText }];
    });

  const patchViz = (concept: Concept, patch: Record<string, unknown>) =>
    writeViz({ ...vizRef.current, [concept]: { ...vizRef.current[concept], ...patch } });

  // Applies raw update_visualization args; returns the summary sent back to
  // the agent as the FunctionCallResponse (ground truth it can't hallucinate).
  const applyUpdate = (args: unknown) => {
    const { next, summary } = applyVizUpdate(vizRef.current, args);
    writeViz(next, true);
    lastActionVizRef.current = next; // student edits diff against agent state
    pushLine("system", `viz ← ${JSON.stringify(summary).slice(0, 140)}`);
    return summary;
  };

  // Mic capture runs in parallel with the WS handshake; failure is reported
  // but doesn't kill the session (useful for diagnosing in odd browsers).
  async function startMic(ws: WebSocket) {
    pushLine("system", "requesting microphone…");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    micStreamRef.current = stream;
    const micCtx = new AudioContext();
    micCtxRef.current = micCtx;
    await micCtx.resume(); // autoplay policy — must be running, not suspended
    await micCtx.audioWorklet.addModule("/mic-worklet.js");
    const source = micCtx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(micCtx, "mic-capture");
    const resampler = new LinearResampler(micCtx.sampleRate, AGENT_SAMPLE_RATE);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (ws.readyState !== WebSocket.OPEN || mutedRef.current) return;
      const resampled = resampler.push(e.data);
      if (resampled.length) ws.send(floatTo16BitPCM(resampled));
    };
    source.connect(node);
    // worklet needs a downstream edge to keep pulling audio; mute so we
    // don't hear ourselves
    const mute = micCtx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(micCtx.destination);
    pushLine("system", `mic live @ ${micCtx.sampleRate}Hz → 16kHz`);
  }

  async function connect() {
    setStatus("connecting");
    setErrorMsg("");
    setLines([]);
    setUnderstanding(null);
    playerRef.current = new PcmPlayer(); // created early — greeting isn't dropped

    try {
      pushLine("system", "fetching token…");
      const { token, error } = await fetch("/api/agent-token").then((r) => r.json());
      if (!token) throw new Error(error ?? "no token from /api/agent-token");
      pushLine("system", "opening socket…");

      const ws = new WebSocket(AGENT_WS_URL, ["token", token]);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") {
          playerRef.current?.enqueue(ev.data, AGENT_SAMPLE_RATE);
          return;
        }
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "Welcome":
            ws.send(JSON.stringify(buildAgentSettings()));
            break;
          case "SettingsApplied":
            pushLine("system", "agent configured — speak now");
            setStatus("connected");
            if (pendingTextRef.current) {
              ws.send(
                JSON.stringify({ type: "InjectUserMessage", content: pendingTextRef.current })
              );
              pendingTextRef.current = null;
            }
            break;
          case "ConversationText":
            pushLine(msg.role === "user" ? "user" : "assistant", msg.content);
            break;
          case "UserStartedSpeaking":
            playerRef.current?.stop(); // barge-in
            break;
          case "FunctionCallRequest":
            for (const fn of msg.functions ?? []) {
              if (!fn.client_side) continue;
              let content: Record<string, unknown>;
              if (fn.name === "update_visualization") {
                let args: unknown = {};
                try {
                  args = JSON.parse(fn.arguments || "{}");
                } catch {
                  args = {};
                }
                content = applyUpdate(args);
              } else if (fn.name === "check_explanation") {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(fn.arguments || "{}");
                } catch {
                  /* keep {} */
                }
                setUnderstanding({
                  stillPresent: Boolean(args.still_present),
                  confidence: typeof args.confidence === "string" ? args.confidence : undefined,
                  miscId: typeof args.original_misconception_id === "string" ? args.original_misconception_id : undefined,
                });
                content = { logged: true };
              } else {
                content = { error: `unknown function ${fn.name}` };
              }
              pushLine("system", `fn ${fn.name}(${fn.arguments}) → ${JSON.stringify(content).slice(0, 120)}`);
              ws.send(
                JSON.stringify({
                  type: "FunctionCallResponse",
                  id: fn.id,
                  name: fn.name,
                  content: JSON.stringify(content),
                })
              );
            }
            break;
          case "FunctionCallCancelled":
            if (vizUndoRef.current) {
              writeViz(vizUndoRef.current);
              lastActionVizRef.current = vizUndoRef.current;
              vizUndoRef.current = null;
              pushLine("system", "viz update cancelled (user kept talking) — reverted");
            }
            break;
          case "Error":
            pushLine("system", `error: ${msg.description ?? msg.code ?? ev.data}`);
            break;
        }
      };

      ws.onerror = () => {
        setStatus("error");
        setErrorMsg("WebSocket error — check console");
      };
      ws.onclose = (e) => {
        pushLine("system", `socket closed (${e.code}${e.reason ? ": " + e.reason : ""})`);
        teardown(false);
        setStatus((s) => (s === "error" ? s : "idle"));
      };

      keepAliveRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, 5000);

      // mic in parallel — surface failure without tearing the session down
      startMic(ws).catch((e) => {
        const name = e instanceof DOMException ? e.name : "";
        const hint =
          name === "NotAllowedError"
            ? "mic permission denied"
            : name === "NotFoundError"
              ? "no microphone found"
              : (e as Error)?.message ?? String(e);
        setErrorMsg(`Microphone failed: ${hint}`);
        pushLine("system", `mic failed: ${hint}`);
      });
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
      teardown();
    }
  }

  function teardown(closeWs = true) {
    if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    keepAliveRef.current = null;
    if (promptSyncRef.current) window.clearTimeout(promptSyncRef.current);
    promptSyncRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    void micCtxRef.current?.close();
    micCtxRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    if (closeWs && wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
  }

  function disconnect() {
    teardown();
    setStatus("idle");
    pushLine("system", "disconnected");
  }

  // Text input rides the same socket — agent responds as if spoken. The user
  // turn echoes back as ConversationText, so no local echo needed. Sending
  // before connecting auto-starts the session and queues the message.
  function sendText(text: string) {
    const content = text.trim();
    if (!content) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (status === "idle" || status === "error") {
        pendingTextRef.current = content;
        setDraft("");
        void connect();
      }
      return;
    }
    ws.send(JSON.stringify({ type: "InjectUserMessage", content }));
    setDraft("");
  }

  function toggleMute() {
    setMuted((m) => {
      mutedRef.current = !m;
      pushLine("system", !m ? "mic muted — type to talk" : "mic live");
      return !m;
    });
  }

  // Aha! exporter — dumps the learning journey to a Markdown note.
  function exportRecap() {
    const s = vizRef.current;
    const summary = summarizeViz(s);
    const misc =
      s.misconceptionId !== "none"
        ? `${s.misconceptionId} — ${MISCONCEPTION_LABELS[s.misconceptionId as keyof typeof MISCONCEPTION_LABELS]}`
        : "none diagnosed";
    const transcript = lines
      .filter((l) => l.role !== "system")
      .map((l) =>
        l.role === "action"
          ? `*Student ${l.text}*`
          : `**${l.role === "user" ? "Student" : "Basecase"}:** ${l.text}`
      )
      .join("\n\n");
    const md = `# Basecase — session recap

- **Concept:** ${s.concept ?? "—"}
- **Diagnosed misconception:** ${misc}
- **Status:** ${understanding?.stillPresent === false ? `resolved${understanding.confidence ? ` (${understanding.confidence} confidence)` : ""}` : "in progress"}
- **Date:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}

## Final visualization state

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## Conversation

${transcript}
`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `basecase-${s.concept ?? "session"}-recap.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const live = status === "connected";

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <svg className="logo" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect x="4" y="4" width="24" height="6.5" rx="2.5" stroke="var(--accent)" strokeWidth="1.8" />
            <rect x="7.5" y="12.75" width="17" height="6.5" rx="2.5" stroke="var(--agent)" strokeWidth="1.8" />
            <rect x="11" y="21.5" width="10" height="6.5" rx="2.5" fill="var(--accent)" />
          </svg>
          <span className="brand-name">Basecase</span>
          <span className="tagline">breaks confusion down to its base case</span>
        </div>
        <div className="header-right">
          {understanding && (
            <span className={`pill ${understanding.stillPresent ? "pill-fuzzy" : "pill-resolved"}`}>
              {understanding.stillPresent ? "still fuzzy" : "basecase reached"}
              {understanding.confidence ? ` · ${understanding.confidence}` : ""}
            </span>
          )}
          {understanding?.stillPresent === false && (
            <button className="chip export-btn" onClick={exportRecap} title="download Markdown recap">
              ↓ export recap
            </button>
          )}
          <span className={`pill pill-${status}`}>{status}</span>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "switch to light mode" : "switch to dark mode"}
            aria-label="toggle theme"
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className={`layout ${viz.concept || devMode ? "" : "layout-chat-only"}`}>
        <section className="viz-col">
          {viz.concept && (
            <VizCanvas
              store={viz}
              onPatch={patchViz}
              onCommit={handleVizCommit}
              resolved={
                understanding?.stillPresent === false &&
                (!understanding.miscId || understanding.miscId === viz.misconceptionId)
              }
            />
          )}
          {devMode && (
            <div className="dev-panel">
              <div className="dev-title">dev harness — fire raw update_visualization args</div>
              {DEV_PRESETS.map((p) => (
                <button key={p.label} className="chip" onClick={() => applyUpdate(p.args)}>
                  {p.label}
                </button>
              ))}
              <button className="chip" onClick={() => setViz((s) => ({ ...s, concept: null }))}>
                clear viz
              </button>
            </div>
          )}
        </section>

        <section className="rail">
          <div className="controls">
            {!live ? (
              <button onClick={connect} disabled={status === "connecting"}>
                {status === "connecting" ? "Connecting…" : "Start session"}
              </button>
            ) : (
              <>
                <button className="stop" onClick={disconnect}>
                  Stop
                </button>
                <button className={`chip mute-btn ${muted ? "chip-on" : ""}`} onClick={toggleMute}>
                  {muted ? "mic off" : "mute mic"}
                </button>
              </>
            )}
          </div>

          {errorMsg && <p className="error">{errorMsg}</p>}

          <div className="topic-row">
            {(["recursion", "sorting", "derivative"] as const).map((t) => (
              <button
                key={t}
                className={`chip ${viz.concept === t ? "chip-on" : ""}`}
                title={`ask about ${t}`}
                onClick={() => sendText(`I need help understanding ${t === "derivative" ? "derivatives" : t}.`)}
              >
                {t}
              </button>
            ))}
          </div>

          <section className="log" ref={logRef}>
            {lines.filter((l) => devMode || l.role !== "system").length === 0 && (
              <div className="empty-log">
                <p className="empty-title">What are you stuck on?</p>
                <p className="dim">
                  Recursion, sorting, derivatives — describe where you got lost.
                  Type below to start instantly, or hit Start session to talk.
                </p>
              </div>
            )}
            {lines
              .filter((l) => devMode || l.role !== "system")
              .map((l, i) =>
              l.role === "system" ? (
                <p key={i} className="line line-system">
                  <span className="bubble">{l.text}</span>
                </p>
              ) : l.role === "action" ? (
                <p key={i} className="line line-action">
                  <span className="action-note">↳ {l.text}</span>
                </p>
              ) : (
                <p key={i} className={`line line-${l.role}`}>
                  <span className="who">{l.role === "user" ? "you" : "basecase"}</span>
                  <span className="bubble">{l.text}</span>
                </p>
              )
            )}
          </section>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              sendText(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={live ? "type instead of talking…" : "type a question to start — no mic needed"}
            />
            <button type="submit" disabled={!draft.trim() || status === "connecting"}>
              send
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
