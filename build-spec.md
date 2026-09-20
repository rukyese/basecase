# Project: Voice-Driven Misconception Visualizer
**HackMIT — Education Track**

## How to use this file
Paste the following as your first message to the coding agent, in the same message as this file (or right after telling it to read this file if it's sitting in the repo):

> Read build-spec.md in the project root fully before writing any code. Follow it exactly, including the priority order and phases below. Use process.env.DEEPGRAM_API_KEY and process.env.OPENAI_API_KEY for the keys — already in .env. Start with Phase 1 only (the WebSocket voice loop) and stop there so I can test it before you continue. Ask before making any architecture decision not covered here.

---

## One-line pitch
A student talks or types through what's confusing them. Instead of asking "do you understand?", the agent diagnoses the *specific* misconception behind their confusion and renders a visualization that directly targets it — then verifies the fix by having the student explain it back.

## Why this is different from a generic AI tutor
Most "AI tutor" hackathon projects generate a text explanation and hope it lands. This project:
1. Classifies confusion into a **known, curated misconception** (not a vague confidence score) — feels diagnostic, not generic.
2. Adjusts a **live visualization** to specifically contrast the student's wrong mental model against the correct one.
3. **Closes the loop** — makes the student explain it back, and checks whether the misconception is actually gone, instead of trusting "yeah I get it now."

---

## Architecture

```
Browser (Next.js/React)
 ├─ Mic input → WebSocket → wss://agent.deepgram.com/agent
 ├─ Receives: audio (TTS playback), function-call events, transcript
 ├─ On update_visualization function call → update React state → re-render viz component
 └─ Viz canvas: one of 3 components (Recursion / Sorting / Derivative), all SVG/React-state driven — NOT LLM-generated markup live. LLM only sends structured params.

Deepgram Voice Agent API (single WebSocket, handles STT + LLM orchestration + TTS)
 ├─ agent.listen.model = Deepgram STT (nova-2/nova-3)
 ├─ agent.think.provider = openai, model = gpt-4o or gpt-4o-mini (use your existing OpenAI key)
 ├─ agent.think.functions = [update_visualization, check_explanation]
 └─ agent.speak.model = Aura voice
```

**Text input (same connection, no separate pipeline):** Deepgram's Voice Agent WebSocket supports an `InjectUserMessage` client message — you send typed text over the exact same WebSocket you're already using for audio, and the agent responds as if it had been spoken, using the same functions and conversation state. Frontend needs: a text box + send button next to the mic button, which on submit sends `{ type: "InjectUserMessage", content: <typed text> }`. No second LLM path to build or keep in sync.

**Key decision:** the LLM never generates raw visualization code live. It only ever outputs structured function-call parameters (concept, misconception_id, viz_state). The 3 visualization components are pre-built, parameterized React components. This is what makes it reliable enough to demo live — no risk of the model generating broken SVG mid-pitch.

**Explicitly NOT in scope — do not build these even if they seem natural to add:**
- No teacher-side dashboard
- No adaptive "zoom levels" (intuition/mechanic/formal) — one fixed level of explanation per concept
- No long-term memory across sessions
- No 4th concept (matrix transformations) unless everything else is done with time to spare
- No provider other than OpenAI for agent.think

---

## Function-calling schema (register with Deepgram agent.think.functions)

### `update_visualization`
```json
{
  "name": "update_visualization",
  "description": "Update the on-screen visualization to reflect the concept being discussed and the student's current misconception.",
  "parameters": {
    "type": "object",
    "properties": {
      "concept": { "type": "string", "enum": ["recursion", "sorting", "derivative"] },
      "misconception_id": {
        "type": "string",
        "description": "One of the known misconception IDs for this concept, or 'none' if student shows no confusion yet.",
        "enum": ["none", "recursion_m1", "recursion_m2",
                 "sorting_m1", "sorting_m2",
                 "derivative_m1", "derivative_m2"]
      },
      "viz_state": {
        "type": "object",
        "description": "Concept-specific state — see per-concept schemas below."
      },
      "narration_hint": { "type": "string", "description": "One short phrase describing what you're about to say, so the viz can sync (e.g. 'highlighting the third stack frame')." }
    },
    "required": ["concept", "misconception_id", "viz_state"]
  }
}
```

### `check_explanation`
Called after asking the student to explain the concept back in their own words.
```json
{
  "name": "check_explanation",
  "description": "Log whether the student's spoken explanation still shows the original misconception, after they've been walked through the visualization.",
  "parameters": {
    "type": "object",
    "properties": {
      "concept": { "type": "string" },
      "original_misconception_id": { "type": "string" },
      "still_present": { "type": "boolean" },
      "confidence": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["concept", "original_misconception_id", "still_present"]
  }
}
```
Frontend shows a small "understanding check: ✅ resolved / 🔁 still fuzzy" badge when this fires — good demo beat.

---

## Concepts, misconceptions, and viz_state shape

### 1. Recursion & Call Stack
**Misconceptions to seed in the system prompt:**
- `recursion_m1` — thinks each recursive call overwrites/loses the previous call's state (doesn't grasp that paused frames wait on the stack)
- `recursion_m2` — confuses recursion depth with total number of calls (e.g. thinks fibonacci(5) makes ~5 calls, not ~15)

**viz_state:**
```json
{ "function_name": "fibonacci", "input": 5, "active_frame_id": 3, "frames": [...], "highlight": "return_value" }
```
**Render as:** vertical stack of frames (each showing local vars + return value once resolved) growing/shrinking live, with a parallel call-tree diagram that highlights the currently active node. This directly refutes both misconceptions by making the "many separate paused frames" fact visually undeniable.

### 2. Sorting Algorithms
**Misconceptions:**
- `sorting_m1` — thinks comparisons happen all-at-once / in parallel, not sequentially
- `sorting_m2` — thinks every comparison causes a swap

**viz_state:**
```json
{ "algorithm": "bubble", "array": [5,3,8,1], "comparing": [0,1], "swapped": false, "pass": 1, "comparisons_so_far": 3 }
```
**Render as:** array as bars, two bars highlighted during comparison (color A), flash color B only on an actual swap, running counters for comparisons vs swaps. That counter alone is usually enough to visibly refute both misconceptions in real time.

### 3. Derivatives / Rate of Change
**Misconceptions:**
- `derivative_m1` — thinks the derivative *is* the function's value at that point, not its slope
- `derivative_m2` — doesn't connect the secant line (average rate over an interval) shrinking to the tangent line (instantaneous rate) as a limit

**viz_state:**
```json
{ "function": "x^2", "point_x": 2, "secant_dx": 0.0, "show_fx_panel": true }
```
**Render as:** interactive graph, draggable point on the curve, tangent line updates live; `secant_dx` animates from a visible value down toward 0 to show secant → tangent; a synced side panel plots f(x) and f'(x) together so m1 becomes visually obvious (the two curves are clearly different things).

---

## System prompt structure (agent.think.prompt)

1. Role: "You are a Socratic tutor helping a student who is stuck on a concept. Your job is to figure out their *specific* misconception, not just answer their question."
2. Embed the full misconception list above, with IDs.
3. Instruction: ask 1-2 short probing questions before diagnosing (don't jump to a diagnosis on the first sentence).
4. Once you have a hypothesis, call `update_visualization` with your best-guess misconception_id and narrate what you're showing.
5. Before ending the topic, ask the student to explain it back in their own words, then call `check_explanation`.
6. Few-shot: include 1 example dialogue per concept showing the full loop (diagnose → visualize → explain-back → check). This matters a lot for reliability — the model will follow the pattern much more consistently with examples than with instructions alone.

---

## Build order — Phase by Phase

| Phase | What | Stop and test? |
|---|---|---|
| 1 | Scaffold Next.js app. Get the Deepgram Voice Agent WebSocket connected end-to-end with a dummy prompt — mic in, hear a voice reply out. | **Yes — highest-risk piece, confirm before continuing.** |
| 2 | Build the 3 visualization components as standalone React components, driven purely by props. Test with hardcoded viz_state, no voice involved yet. | No |
| 3 | Register the two functions with the agent, wire function-call events from the WebSocket to the viz components' state. | No |
| 4 | Write the full system prompt with misconception lists + few-shot examples. This is where most of the "smart" feeling comes from. | No |
| 5 | Add text input (`InjectUserMessage`) + minimal UI: transcript panel, understanding-check badge, topic picker. | No |
| 6 | End-to-end test all 3 concepts. Fix bugs. | **Yes — you drive this phase, not the agent.** |
| 7 | Rehearse demo with 2-3 scripted "stuck student" lines per concept that reliably trigger each misconception. | **Yes — you drive this phase.** |

Checkpoint: if Phases 1–2 aren't both done by the time you're 4 hours into the remaining build, cut to 2 concepts and drop text input to stretch-only. Protect Phases 6–7 no matter what — a demo that works on 2 concepts beats one that's shaky on 3.

---

## In scope, confirmed
- Voice input (Deepgram STT) **and** text input (Deepgram `InjectUserMessage` over the same connection) — student can talk or type, same agent, same functions
- 3 concepts, 2 misconceptions each (6 total) — kept narrow on purpose for demo reliability
