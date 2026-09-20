// Maps raw update_visualization arguments (LLM output — partial, loosely
// typed) onto our VizStore. Liberal about key names, clamps everything, and
// returns a `summary` of the *actual resulting state + derived facts* meant
// to be sent back as the FunctionCallResponse so the agent narrates truth.

import { buildRecursionTrace, RECURSION_FNS } from "./recursion";
import { buildSortTrace } from "./sorting";
import { DERIV_FNS, matchDerivFn } from "./derivative";
import {
  makeItems,
  type Concept,
  type MisconceptionId,
  type RecursionFn,
  type SortAlgorithm,
  type VizStore,
} from "./types";

const CONCEPTS: Concept[] = ["recursion", "sorting", "derivative"];
const MISC_IDS: MisconceptionId[] = [
  "none", "recursion_m1", "recursion_m2",
  "sorting_m1", "sorting_m2",
  "derivative_m1", "derivative_m2",
];

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(+v) ? +v : null;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

const SPEED_MAP: Record<string, number> = { slow: 1200, normal: 700, fast: 350 };
const matchSpeed = (raw: unknown): number | null => {
  if (typeof raw === "string") return SPEED_MAP[raw.toLowerCase()] ?? null;
  const n = num(raw);
  return n !== null ? clamp(n, 150, 2500) : null;
};

function matchRecursionFn(raw: unknown): RecursionFn | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s.includes("fib")) return "fibonacci";
  if (s.includes("fact")) return "factorial";
  if (s.includes("sum")) return "sum";
  return null;
}

function matchSortAlgo(raw: unknown): SortAlgorithm | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s.includes("bub")) return "bubble";
  if (s.includes("sel")) return "selection";
  if (s.includes("ins")) return "insertion";
  return null;
}

export interface ApplyResult {
  next: VizStore;
  summary: Record<string, unknown>;
}

export function applyVizUpdate(prev: VizStore, args: unknown): ApplyResult {
  const a = (args ?? {}) as Record<string, unknown>;
  const vs = (a.viz_state ?? {}) as Record<string, unknown>;

  const concept = CONCEPTS.includes(a.concept as Concept) ? (a.concept as Concept) : prev.concept;
  const misconceptionId = MISC_IDS.includes(a.misconception_id as MisconceptionId)
    ? (a.misconception_id as MisconceptionId)
    : prev.misconceptionId;
  const narrationHint = typeof a.narration_hint === "string" ? a.narration_hint : prev.narrationHint;

  const next: VizStore = { ...prev, concept, misconceptionId, narrationHint };

  if (concept === "recursion") {
    const r = { ...prev.recursion };
    const fn = matchRecursionFn(pick(vs, "function_name", "function", "fn"));
    if (fn) r.fn = fn;
    const input = num(pick(vs, "input", "n", "arg"));
    if (input !== null) r.input = clamp(Math.round(input), 1, RECURSION_FNS[r.fn].maxInput);
    const trace = buildRecursionTrace(r.fn, r.input);
    const step = num(pick(vs, "step_index", "stepIndex", "step"));
    const frameId = num(pick(vs, "active_frame_id", "activeFrameId"));
    if (step !== null) r.stepIndex = clamp(Math.round(step), 0, trace.snapshots.length - 1);
    else if (frameId !== null) {
      const node = trace.nodes[clamp(Math.round(frameId), 0, trace.nodes.length - 1)];
      r.stepIndex = node.enterStep;
    }
    const playing = pick(vs, "playing", "play");
    if (typeof playing === "boolean") r.playing = playing;
    const spd = matchSpeed(pick(vs, "speed", "speed_ms", "speedMs"));
    if (spd !== null) r.speedMs = spd;
    const hl = pick(vs, "highlight");
    r.highlight = typeof hl === "string" ? hl : null;
    next.recursion = r;
  } else if (concept === "sorting") {
    const s = { ...prev.sorting };
    const algo = matchSortAlgo(pick(vs, "algorithm", "algo"));
    if (algo) s.algorithm = algo;
    const rawArr = pick(vs, "array", "items", "values");
    if (Array.isArray(rawArr) && rawArr.every((x) => num(x) !== null)) {
      const vals = rawArr.map((x) => clamp(Math.round(num(x)!), 1, 99)).slice(0, 12);
      if (vals.length >= 3) s.items = makeItems(vals);
    }
    const trace = buildSortTrace(s.algorithm, s.items);
    const step = num(pick(vs, "step_index", "stepIndex", "step"));
    const comparing = pick(vs, "comparing");
    if (step !== null) {
      s.stepIndex = clamp(Math.round(step), 0, trace.steps.length - 1);
    } else if (Array.isArray(comparing) && comparing.length === 2) {
      const idx = trace.steps.findIndex(
        (st, i) =>
          i > s.stepIndex &&
          st.comparing &&
          st.comparing[0] === num(comparing[0]) &&
          st.comparing[1] === num(comparing[1])
      );
      if (idx >= 0) s.stepIndex = idx;
    }
    const playing = pick(vs, "playing", "play");
    if (typeof playing === "boolean") s.playing = playing;
    const spd = matchSpeed(pick(vs, "speed", "speed_ms", "speedMs"));
    if (spd !== null) s.speedMs = spd;
    next.sorting = s;
  } else if (concept === "derivative") {
    const d = { ...prev.derivative };
    const fn = matchDerivFn(pick(vs, "function", "fn", "f"));
    if (fn) d.fn = fn;
    const range = num(pick(vs, "range", "domain"));
    if (range !== null) d.range = clamp(range, 2, 10);
    const px = num(pick(vs, "point_x", "pointX", "x"));
    if (px !== null) d.pointX = clamp(px, -d.range, d.range);
    const dx = num(pick(vs, "secant_dx", "secantDx", "h"));
    if (dx !== null) d.secantDx = clamp(dx, 0, 3);
    const panel = pick(vs, "show_fx_panel", "showFxPanel");
    if (typeof panel === "boolean") d.showFxPanel = panel;
    next.derivative = d;
  }

  return { next, summary: summarizeViz(next) };
}

const round2 = (n: number) => +n.toFixed(2);

// Turns a committed student edit into a short description for the
// "[The student …]" injection. Only the actions worth the agent noticing —
// stepping/scrubbing stays silent (the prompt state block covers it).
export function describeVizDelta(prev: VizStore, next: VizStore): string | null {
  if (!next.concept || prev.concept !== next.concept) return null;
  if (next.concept === "recursion") {
    const a = prev.recursion, b = next.recursion;
    if (b.fn !== a.fn || b.input !== a.input) return `changed the demo to ${b.fn}(${b.input})`;
    if (b.playing !== a.playing) return b.playing ? "pressed play" : "paused it";
    return null;
  }
  if (next.concept === "sorting") {
    const a = prev.sorting, b = next.sorting;
    if (b.algorithm !== a.algorithm) return `switched to ${b.algorithm} sort`;
    if (b.items !== a.items) return `changed the array to [${b.items.map((i) => i.v).join(", ")}]`;
    if (b.playing !== a.playing) return b.playing ? "pressed play" : "paused it";
    return null;
  }
  const a = prev.derivative, b = next.derivative;
  if (b.fn !== a.fn) return `switched the function to ${DERIV_FNS[b.fn].label}`;
  if (b.pointX !== a.pointX) return `moved the point to x=${round2(b.pointX)}`;
  if (b.secantDx !== a.secantDx) return `dragged h to ${round2(b.secantDx)}`;
  if (b.range !== a.range) return `zoomed the range to ±${b.range}`;
  return null;
}

// What we hand back to the agent in FunctionCallResponse: the resulting state
// plus derived facts it could not compute reliably itself.
export function summarizeViz(store: VizStore): Record<string, unknown> {
  const base = { applied: true, concept: store.concept, misconception_id: store.misconceptionId };
  if (store.concept === "recursion") {
    const r = store.recursion;
    const t = buildRecursionTrace(r.fn, r.input);
    const snap = t.snapshots[Math.min(r.stepIndex, t.snapshots.length - 1)];
    return {
      ...base,
      function: r.fn,
      input: r.input,
      total_calls: t.totalCalls,
      max_depth: t.maxDepth,
      current_stack_depth: snap?.frames.length ?? 0,
      active_call: snap?.activeId != null ? RECURSION_FNS[r.fn].call(t.nodes[snap.activeId].arg) : null,
      step: `${r.stepIndex + 1}/${t.snapshots.length}`,
      playing: r.playing,
    };
  }
  if (store.concept === "sorting") {
    const s = store.sorting;
    const t = buildSortTrace(s.algorithm, s.items);
    const step = t.steps[Math.min(s.stepIndex, t.steps.length - 1)];
    return {
      ...base,
      algorithm: s.algorithm,
      array: s.items.map((i) => i.v),
      total_steps: t.steps.length - 1,
      comparisons_so_far: step?.comparisons ?? 0,
      swaps_so_far: step?.swaps ?? 0,
      comparisons_total: t.totalComparisons,
      swaps_total: t.totalSwaps,
      playing: s.playing,
    };
  }
  if (store.concept === "derivative") {
    const d = store.derivative;
    const fn = DERIV_FNS[d.fn];
    return {
      ...base,
      function: fn.label,
      point_x: d.pointX,
      f_value: +fn.f(d.pointX).toFixed(3),
      f_prime_value: +fn.d(d.pointX).toFixed(3),
      secant_dx: d.secantDx,
      show_fx_panel: d.showFxPanel,
    };
  }
  return base;
}
