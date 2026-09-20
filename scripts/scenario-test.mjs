// Scenario test against the REAL agent settings (bundled from
// lib/agent-settings.ts via esbuild — same payload the browser sends).
//
// Turn 1: vague opener  → expect NO function call, just an intent question
// Turn 2: stated misconception → expect update_visualization (derivative)
// Turn 3: bracketed student-action note → expect a short spoken reaction
// Turn 4: explain-back → expect check_explanation (best-effort)
//
// Usage: node scripts/scenario-test.mjs

import process from "node:process";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

try {
  process.loadEnvFile(".env");
} catch { /* already loaded */ }

const DG_KEY = process.env.DEEPGRAM_API_KEY;
if (!DG_KEY) {
  console.error("FAIL: DEEPGRAM_API_KEY not set");
  process.exit(1);
}

execSync(
  "npx esbuild lib/agent-settings.ts --bundle --format=esm --outfile=scripts/.agent-settings.bundle.mjs",
  { stdio: "inherit" }
);
const { buildAgentSettings } = await import(
  pathToFileURL(`${process.cwd()}/scripts/.agent-settings.bundle.mjs`).href
);

const URL = "wss://agent.deepgram.com/v1/agent/converse";
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

const SCENARIOS = {
  derivative: [
    {
      name: "vague opener",
      inject: "I need help understanding derivatives.",
      expectFn: null, // should NOT call update_visualization yet
    },
    {
      name: "stated misconception",
      inject: "Isn't the derivative just the value of the function at that point?",
      expectFn: "update_visualization",
    },
    {
      name: "student-action note",
      inject: "[The student dragged h to 0.1]",
      expectFn: null,
    },
    {
      name: "explain-back",
      inject: "So the derivative is the slope of the curve at that point — the steepness — not the y value.",
      expectFn: null,
    },
    {
      name: "formal explain-back",
      inject: "The derivative at a point is the slope of the tangent line there — how fast the function is changing at that point.",
      expectFn: "check_explanation",
    },
  ],
  sorting: [
    {
      name: "stated misconception",
      inject: "Bubble sort confuses me — doesn't the computer compare all the pairs at the same time?",
      expectFn: "update_visualization",
    },
    {
      name: "student-action note",
      inject: "[The student shuffled the array]",
      expectFn: null,
    },
    {
      name: "formal explain-back",
      inject: "It goes left to right comparing each adjacent pair, one comparison at a time, and swaps only when they're out of order.",
      expectFn: "check_explanation",
    },
  ],
  recursion: [
    {
      name: "stated misconception",
      inject: "I don't get recursion — when fibonacci calls itself, doesn't the new call just overwrite the old one's variables?",
      expectFn: "update_visualization",
    },
    {
      name: "student-action note",
      inject: "[The student changed the demo to factorial(6)]",
      expectFn: null,
    },
    {
      name: "formal explain-back",
      inject: "Each call pauses on the stack and waits for its inner call to return, then resumes — the old call's variables stay safe in their own frame.",
      expectFn: "check_explanation",
    },
  ],
};

const TURNS = SCENARIOS[process.env.SCENARIO ?? "derivative"] ?? SCENARIOS.derivative;

let turnIdx = -1;
const turnResults = [];
let cur = null;
let turnTimer = null;
let keepAlive;
let lastMsgAt = Date.now();

const ws = new WebSocket(URL, ["token", DG_KEY]);

function finishTurn() {
  if (!cur) return;
  turnResults.push(cur);
  log(
    `== turn "${cur.name}": fns=[${cur.fns.join(",") || "none"}] spoke=${JSON.stringify(cur.text.slice(0, 160))}`
  );
  cur = null;
  setTimeout(nextTurn, 800);
}

function nextTurn() {
  turnIdx++;
  if (turnIdx >= TURNS.length) return done();
  const t = TURNS[turnIdx];
  cur = { name: t.name, inject: t.inject, fns: [], text: "", sawEcho: false };
  lastMsgAt = Date.now();
  log(`-> inject (${t.name}): ${JSON.stringify(t.inject)}`);
  ws.send(JSON.stringify({ type: "InjectUserMessage", content: t.inject }));
  clearTimeout(turnTimer);
  turnTimer = setTimeout(() => {
    log(`(turn "${t.name}" timed out — moving on)`);
    finishTurn();
  }, 60000);
}

// A turn ends when the user echo has arrived AND the socket's been quiet 8s
// (multi-chunk replies and late function calls all count as activity).
setInterval(() => {
  if (cur?.sawEcho && Date.now() - lastMsgAt > 8000) finishTurn();
}, 500);

function done() {
  clearInterval(keepAlive);
  clearTimeout(turnTimer);
  ws.close();
  console.log("\n=== RESULTS ===");
  let pass = true;
  for (const [i, r] of turnResults.entries()) {
    const want = TURNS[i].expectFn;
    let ok;
    if (want === null) ok = r.fns.length === 0;
    else if (want) ok = r.fns.includes(want);
    else ok = true;
    const leakedJson = /\{|update_visualization|check_explanation|function call/i.test(r.text);
    log(
      `${ok ? "PASS" : "SOFT-FAIL"} ${r.name}: wanted ${want ?? "no fn"}, got [${r.fns}]` +
        (leakedJson ? "  ⚠ possible JSON-speak in reply" : "")
    );
    if (!ok) pass = false;
    if (leakedJson) log(`   reply was: ${JSON.stringify(r.text)}`);
  }
  log(pass ? "ALL TURNS OK" : "some turns missed expectations (see above)");
  process.exit(0);
}

setTimeout(() => {
  log("global timeout (4min)");
  done();
}, 240000);

ws.addEventListener("open", () => log("ws open"));
ws.addEventListener("error", (e) => {
  log("ws error", e.message ?? e);
  process.exit(1);
});

keepAlive = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
}, 4000);

ws.addEventListener("message", async (ev) => {
  lastMsgAt = Date.now();
  if (typeof ev.data !== "string") return; // audio
  const msg = JSON.parse(ev.data);
  switch (msg.type) {
    case "Welcome":
      ws.send(JSON.stringify(buildAgentSettings()));
      break;
    case "SettingsApplied":
      log("settings applied — starting scenario");
      setTimeout(nextTurn, 4000); // let the greeting finish first
      break;
    case "FunctionCallRequest":
      for (const fn of msg.functions ?? []) {
        log(`   fn ${fn.name} ${fn.arguments}`);
        cur?.fns.push(fn.name);
        if (fn.client_side) {
          ws.send(
            JSON.stringify({
              type: "FunctionCallResponse",
              id: fn.id,
              name: fn.name,
              content: JSON.stringify({ applied: true, point_x: 3, f_value: 9, f_prime_value: 6 }),
            })
          );
        }
      }
      break;
    case "ConversationText":
      if (msg.role === "assistant") {
        if (cur) cur.text += (cur.text ? " " : "") + msg.content;
        log(`   agent: ${msg.content}`);
      } else {
        log(`   user: ${msg.content}`);
        if (cur && !cur.sawEcho && msg.content.includes(cur.inject.slice(0, 20)))
          cur.sawEcho = true;
      }
      break;
    case "Error":
      log("server error:", ev.data);
      break;
  }
});
