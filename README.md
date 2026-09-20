# Basecase

> Breaks confusion down to its base case.

**Basecase** is a voice- and text-driven misconception visualizer for technical education. A student talks or types through what's confusing them — the tutor diagnoses the *specific* misconception behind the confusion, renders a visualization that contrasts the wrong mental model with the correct one, and verifies the fix by having the student explain it back. When they nail it, they've "reached the basecase."

Built for HackMIT. Next.js + Deepgram Voice Agent (managed OpenAI think provider) + deterministic React/SVG visualizations.

## The loop

1. **Chat first** — the student describes where they're stuck (voice or text).
2. **Diagnose** — the agent maps their confusion onto a curated misconception set.
3. **Contrast** — the screen splits: the real visualization on one side, and a dashed **ghost inset** literally rendering *the model the student described* — so the refutation is visual, not just verbal.
4. **Probe while they watch** — Questions pointed at what's on screen; the agent always knows the live viz state (including edits the student made themselves).
5. **Explain-back** — Verifies understanding by having the student explain it back to the agent.

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
# create .env with DEEPGRAM_API_KEY=<your key>
npm run dev            # http://localhost:3000
```
