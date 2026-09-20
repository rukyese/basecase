// Shared viz state model. One VizStore holds per-concept state so switching
// concepts preserves each one's configuration. Both the agent (via
// update_visualization) and the student's controls write through the same
// update path.

export type Concept = "recursion" | "sorting" | "derivative";

export type MisconceptionId =
  | "none"
  | "recursion_m1"
  | "recursion_m2"
  | "sorting_m1"
  | "sorting_m2"
  | "derivative_m1"
  | "derivative_m2";

export type RecursionFn = "fibonacci" | "factorial" | "sum";
export type SortAlgorithm = "bubble" | "selection" | "insertion";
export type DerivativeFnKey = "x2" | "x3" | "sin" | "x2m2x";

export interface RecursionVizState {
  fn: RecursionFn;
  input: number; // 1..7 (fib) / 1..10 (linear fns)
  stepIndex: number; // index into the computed trace
  playing: boolean;
  speedMs: number; // ms per step while playing
  highlight: string | null; // e.g. "return_value"
}

export interface SortItem {
  id: number;
  v: number;
}

export interface SortingVizState {
  algorithm: SortAlgorithm;
  items: SortItem[];
  stepIndex: number;
  playing: boolean;
  speedMs: number;
}

export interface DerivativeVizState {
  fn: DerivativeFnKey;
  pointX: number;
  secantDx: number; // h — component tweens toward this
  showFxPanel: boolean;
  range: number; // x domain half-width: [-range, range]
}

export interface VizStore {
  concept: Concept | null;
  misconceptionId: MisconceptionId;
  narrationHint: string | null;
  recursion: RecursionVizState;
  sorting: SortingVizState;
  derivative: DerivativeVizState;
}

let nextItemId = 0;
export function makeItems(values: number[]): SortItem[] {
  return values.map((v) => ({ id: nextItemId++, v }));
}

export function randomItems(n: number): SortItem[] {
  const vals = new Set<number>();
  while (vals.size < n) vals.add(2 + Math.floor(Math.random() * 18));
  return makeItems([...vals]);
}

export const MISCONCEPTION_LABELS: Record<Exclude<MisconceptionId, "none">, string> = {
  recursion_m1: "thinks each call overwrites the last",
  recursion_m2: "confuses depth with total calls",
  sorting_m1: "thinks comparisons run in parallel",
  sorting_m2: "thinks every comparison swaps",
  derivative_m1: "thinks derivative = function value",
  derivative_m2: "misses secant → tangent limit",
};

export const DEFAULT_VIZ_STORE: VizStore = {
  concept: null,
  misconceptionId: "none",
  narrationHint: null,
  recursion: { fn: "fibonacci", input: 5, stepIndex: 0, playing: false, speedMs: 700, highlight: null },
  sorting: { algorithm: "bubble", items: makeItems([5, 3, 8, 1, 6, 2, 7, 4]), stepIndex: 0, playing: false, speedMs: 700 },
  derivative: { fn: "x2", pointX: 2, secantDx: 2, showFxPanel: true, range: 6 },
};
