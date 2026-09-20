# Basecase

> Breaks confusion down to its base case.

**Basecase** is a voice- and text-driven misconception visualizer for CS education. A student talks or types through what's confusing them — the tutor diagnoses the *specific* misconception behind the confusion, renders a visualization that contrasts the wrong mental model with the correct one, and verifies the fix by having the student explain it back. When they nail it, they've "reached the basecase."

Built for HackMIT. Next.js + Deepgram Voice Agent (managed OpenAI think provider) + deterministic React/SVG visualizations.

## The loop

1. **Chat first** — the student describes where they're stuck (voice or text, interchangeable mid-session, including typing before ever connecting the mic).
2. **Diagnose** — the agent maps their confusion onto a curated misconception set (e.g. `sorting_m1`: "thinks comparisons happen in parallel").
3. **Contrast** — the screen splits: the real visualization on one side, and a dashed **ghost inset** literally rendering *the model the student described* — so the refutation is visual, not just verbal.
4. **Probe while they watch** — Socratic questions pointed at what's on screen; the agent always knows the live viz state (including edits the student made themselves).
5. **Explain-back** — `check_explanation` verifies understanding; on resolve the ghost visibly dies and a Markdown "aha!" recap becomes downloadable.

## What makes it different

- **The visuals can't lie.** Deterministic engines compute every recursion trace, comparison/swap step, and derivative value locally. The LLM only picks inputs — it never generates visualization code or math. Function-call responses carry ground truth back (`total_calls`, `comparisons_so_far`, …) so the *voice can't hallucinate numbers* either.
- **The agent sees your hands.** Committed student edits (dragging `h` toward zero, shuffling the array, switching algorithms) are silently synced into the prompt's `CURRENT VISUALIZATION STATE` block via `UpdatePrompt`, and salient ones are injected as context notes so the tutor can react ("you just dragged h almost to zero — what did the secant become?").
- **Misconception ghosts.** Each of the six curated misconceptions has a visual of the *wrong* belief: a single stack frame being overwritten, all sort pairs flashing at once, a dashed `f′ = f` ghost curve. Resolved → struck through and labeled *debunked*.

## Concepts & misconceptions

| Concept | Misconceptions covered |
|---|---|
| Recursion & the call stack | each call overwrites the last · depth confused for total calls |
| Sorting | comparisons happen in parallel · every comparison causes a swap |
| Derivatives | derivative = function value · misses the secant→tangent limit |

Each viz is fully student-controllable: function/algorithm selectors, input/array-size controls, shuffle, play/step transport with speed, draggable point on the curve, secant `h` slider, zoom.

## Setup

```bash
npm install
# create .env with DEEPGRAM_API_KEY=<your key>   (gitignored)
npm run dev            # http://localhost:3000
```

Environment variables (server-side only):

| Var | Used for |
|---|---|
| `DEEPGRAM_API_KEY` | minting the agent token in `/api/agent-token` (browser fetches it at runtime; falls back to the raw key for local demo if the key lacks grant permissions) |
| `OPENAI_API_KEY` | present for completeness — the think provider is Deepgram-**managed** `open_ai`, so this key is never sent to the browser |

## Testing

```bash
node scripts/verify-agent.mjs              # Phase-1 smoke: WS, settings, fn call, TTS audio
node scripts/scenario-test.mjs             # full derivative loop: opener → viz → action note → explain-back
SCENARIO=sorting node scripts/scenario-test.mjs
SCENARIO=recursion node scripts/scenario-test.mjs
```

Open `http://localhost:3000/?dev=1` for the dev harness — buttons that fire raw `update_visualization` args through the real code path, plus system-log visibility in the transcript.

## Architecture

```
app/api/agent-token/route.ts   token mint (grant → raw-key fallback for local)
lib/agent-settings.ts          Deepgram Settings payload: nova-3 STT + keyterms,
                               managed open_ai think, aura-2 TTS, fn schemas
lib/prompt.ts                  system prompt + buildSystemPrompt(viz) — the
                               CURRENT STATE footer resent via UpdatePrompt
lib/viz/*.ts                   deterministic engines + normalizer (LLM args →
                               clamped state + derived-facts summary)
components/viz/*.tsx           RecursionViz / SortingViz / DerivativeViz /
                               GhostInset / VizCanvas — pure props in, React/SVG out
app/page.tsx                   WS client: mic capture (AudioWorklet → linear16),
                               TTS playback, function dispatch, action-note
                               injection, transcript, aha! exporter
public/mic-worklet.js          AudioWorklet mic capture
```

Deepgram flow: `Welcome` → `Settings` → `SettingsApplied` → binary linear16 mic in / linear16 TTS out, with `InjectUserMessage`, `FunctionCallRequest`/`Response`, `UpdatePrompt`, `KeepAlive` on the same socket.

## Deliberately out of scope

No Excalidraw export, no cadence/silence detection, no teacher dashboard, no long-term memory, no fourth concept — depth on one perfect loop over breadth.
