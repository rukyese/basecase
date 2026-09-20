// Settings sent to the Deepgram Voice Agent immediately after `Welcome`.
// Phase 4 replaces the interim prompt in lib/prompt.ts with the full
// misconception list + few-shot dialogues.

import { buildSystemPrompt } from "./prompt";

export const AGENT_WS_URL = "wss://agent.deepgram.com/v1/agent/converse";

export const AGENT_FUNCTIONS = [
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
          description:
            "One of the known misconception IDs for this concept, or 'none' if student shows no confusion yet.",
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
        viz_state: {
          type: "object",
          description: "Concept-specific state — inputs, current step, flags.",
        },
        narration_hint: {
          type: "string",
          description:
            "One short phrase describing what you're about to say, so the viz can sync (e.g. 'highlighting the third stack frame').",
        },
      },
      required: ["concept", "misconception_id", "viz_state"],
    },
  },
  {
    name: "check_explanation",
    description:
      "Log whether the student's spoken explanation still shows the original misconception, after they've been walked through the visualization.",
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

export function buildAgentSettings(viz?: import("./viz/types").VizStore) {
  return {
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 16000 },
      output: { encoding: "linear16", sample_rate: 16000, container: "none" },
    },
    agent: {
      listen: {
        provider: {
          type: "deepgram",
          model: "nova-3",
          keyterms: [
            "recursion", "fibonacci", "factorial", "call stack",
            "bubble sort", "selection sort", "insertion sort",
            "derivative", "secant", "tangent",
          ],
        },
      },
      think: {
        // managed by Deepgram — no OpenAI key needed
        provider: { type: "open_ai", model: "gpt-4o-mini" },
        functions: AGENT_FUNCTIONS,
        prompt: buildSystemPrompt(viz),
      },
      speak: {
        provider: { type: "deepgram", model: "aura-2-thalia-en" },
      },
      greeting:
        "Hey — what are you stuck on? Name a topic like recursion, sorting, or derivatives, or just describe where you got lost, and I'll show you what's actually going on.",
    },
  };
}
