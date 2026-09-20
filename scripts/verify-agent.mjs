// Headless Phase-1 verification for the Deepgram Voice Agent loop.
// Confirms, without a browser or mic:
//   1. WS connects and accepts our Settings (managed open_ai think provider)
//   2. InjectUserMessage produces an agent response (ConversationText + audio)
//   3. Client-side function calling works under the MANAGED provider
//      (FunctionCallRequest -> FunctionCallResponse -> agent continues)
// Usage: node scripts/verify-agent.mjs   (reads .env from repo root)

import process from "node:process";

try {
  process.loadEnvFile(".env");
} catch {
  // .env already loaded or missing
}

const DG_KEY = process.env.DEEPGRAM_API_KEY;
if (!DG_KEY) {
  console.error("FAIL: DEEPGRAM_API_KEY not set");
  process.exit(1);
}

const URL = "wss://agent.deepgram.com/v1/agent/converse";

const FUNCTIONS = [
  {
    name: "update_visualization",
    description:
      "Update the on-screen visualization to reflect the concept being discussed and the student's current misconception.",
    parameters: {
      type: "object",
      properties: {
        concept: { type: "string", enum: ["recursion", "sorting", "derivative"] },
        misconception_id: {
          type: "string",
          enum: [
            "none",
            "recursion_m1",
            "recursion_m2",
            "sorting_m1",
            "sorting_m2",
            "derivative_m1",
            "derivative_m2",
          ],
        },
        viz_state: { type: "object" },
        narration_hint: { type: "string" },
      },
      required: ["concept", "misconception_id", "viz_state"],
    },
  },
  {
    name: "check_explanation",
    description:
      "Log whether the student's spoken explanation still shows the original misconception.",
    parameters: {
      type: "object",
      properties: {
        concept: { type: "string" },
        original_misconception_id: { type: "string" },
        still_present: { type: "boolean" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["concept", "original_misconception_id", "still_present"],
    },
  },
];

const settings = {
  type: "Settings",
  audio: {
    input: { encoding: "linear16", sample_rate: 16000 },
    output: { encoding: "linear16", sample_rate: 16000, container: "none" },
  },
  agent: {
    listen: { provider: { type: "deepgram", model: "nova-3" } },
    think: {
      provider: { type: "open_ai", model: "gpt-4o-mini" }, // managed — no key
      functions: FUNCTIONS,
      prompt:
        "You are a tutor with a visualization tool. When the student describes confusion " +
        "about recursion, sorting, or derivatives, you MUST call update_visualization with " +
        "your best-guess misconception_id before explaining. Never refuse to call it.",
    },
    speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } },
  },
};

const results = {
  welcome: false,
  settingsApplied: false,
  functionCallRequest: false,
  agentRespondedAfterFunction: false,
  audioBytes: 0,
};

const ws = new WebSocket(URL, ["token", DG_KEY]);
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const keepAlive = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
}, 4000);
setInterval(() => log(`audioBytes=${results.audioBytes}`), 3000);

const fail = (msg) => {
  log("FAIL:", msg);
  clearInterval(keepAlive);
  ws.close();
  process.exit(1);
};

setTimeout(() => fail("timeout (60s) — see partial results above"), 60000);

ws.addEventListener("open", () => log("ws open"));
ws.addEventListener("error", (e) => fail(`ws error: ${e.message ?? e}`));
ws.addEventListener("close", (e) => log(`ws closed code=${e.code} reason=${e.reason}`));

ws.addEventListener("message", async (ev) => {
  if (typeof ev.data !== "string") {
    const buf = ev.data instanceof Blob ? await ev.data.arrayBuffer() : ev.data;
    results.audioBytes += buf.byteLength;
    return;
  }
  const msg = JSON.parse(ev.data);
  log("<-", msg.type, msg.type === "ConversationText" ? JSON.stringify(msg.role + ": " + msg.content) : "");

  switch (msg.type) {
    case "Welcome":
      results.welcome = true;
      ws.send(JSON.stringify(settings));
      break;
    case "SettingsApplied":
      results.settingsApplied = true;
      ws.send(
        JSON.stringify({
          type: "InjectUserMessage",
          content:
            "I'm confused about recursion — when fibonacci calls itself, doesn't the new call just overwrite the old one's variables?",
        })
      );
      break;
    case "FunctionCallRequest": {
      results.functionCallRequest = true;
      for (const fn of msg.functions ?? []) {
        log("   function:", fn.name, "args:", fn.arguments, "client_side:", fn.client_side);
        if (fn.client_side) {
          ws.send(
            JSON.stringify({
              type: "FunctionCallResponse",
              id: fn.id,
              name: fn.name,
              content: JSON.stringify({ ok: true, total_calls: 15, max_depth: 5 }),
            })
          );
          // exercise the silent state-sync channel used for student viz edits
          ws.send(
            JSON.stringify({
              type: "UpdatePrompt",
              prompt: "Test prompt resend. CURRENT VISUALIZATION STATE: {applied:true,concept:\"recursion\"}",
            })
          );
          results.updatePromptSent = true;
        }
      }
      break;
    }
    case "ConversationText":
      if (msg.role === "assistant" && results.functionCallRequest) {
        results.agentRespondedAfterFunction = true;
      }
      break;
    case "Error":
    case "AgentError":
      fail(`server error: ${ev.data}`);
      break;
    case "AgentAudioDone": {
      log("results:", JSON.stringify(results));
      const pass =
        results.welcome &&
        results.settingsApplied &&
        results.functionCallRequest &&
        results.agentRespondedAfterFunction &&
        results.audioBytes > 0;
      log(pass ? "PASS" : "FAIL");
      clearInterval(keepAlive);
      ws.close();
      process.exit(pass ? 0 : 1);
    }
  }
});
