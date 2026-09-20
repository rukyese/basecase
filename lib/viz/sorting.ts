// Deterministic sorting trace engine. Each step = ONE comparison (with the
// swap that resulted from it, if any) — exactly what the spec's viz_state
// models. Sequential replay of comparisons-vs-swaps counters is what refutes
// sorting_m1 (parallel) and sorting_m2 (every compare swaps).

import type { SortAlgorithm, SortItem } from "./types";

export interface SortStep {
  order: number[]; // item ids by position after this step
  comparing: [number, number] | null; // positions
  swapped: boolean;
  pass: number;
  comparisons: number;
  swaps: number;
  sortedFrom: number; // positions >= sortedFrom are finalized
}

export interface SortTrace {
  steps: SortStep[];
  totalComparisons: number;
  totalSwaps: number;
}

export const SORT_ALGOS: Record<SortAlgorithm, string> = {
  bubble: "Bubble sort",
  selection: "Selection sort",
  insertion: "Insertion sort",
};

export function buildSortTrace(algorithm: SortAlgorithm, items: SortItem[]): SortTrace {
  const arr = items.slice();
  const n = arr.length;
  const steps: SortStep[] = [];
  let comparisons = 0;
  let swaps = 0;

  const push = (comparing: [number, number] | null, swapped: boolean, pass: number, sortedFrom: number) =>
    steps.push({
      order: arr.map((it) => it.id),
      comparing,
      swapped,
      pass,
      comparisons,
      swaps,
      sortedFrom,
    });

  push(null, false, 0, n); // initial state

  if (algorithm === "bubble") {
    for (let pass = 1; pass <= n - 1; pass++) {
      for (let i = 0; i < n - pass; i++) {
        comparisons++;
        let swapped = false;
        if (arr[i].v > arr[i + 1].v) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          swaps++;
          swapped = true;
        }
        push([i, i + 1], swapped, pass, n - pass);
      }
    }
  } else if (algorithm === "selection") {
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      for (let j = i + 1; j < n; j++) {
        comparisons++;
        push([min, j], false, i + 1, i);
        if (arr[j].v < arr[min].v) min = j;
      }
      if (min !== i) {
        [arr[i], arr[min]] = [arr[min], arr[i]];
        swaps++;
        push([i, min], true, i + 1, i + 1);
      }
    }
  } else {
    // insertion — adjacent swaps so the visual reads as sliding
    for (let i = 1; i < n; i++) {
      let j = i;
      while (j > 0) {
        comparisons++;
        if (arr[j - 1].v > arr[j].v) {
          [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
          swaps++;
          push([j - 1, j], true, i, i + 1);
          j--;
        } else {
          push([j - 1, j], false, i, i + 1);
          break;
        }
      }
    }
  }

  return { steps, totalComparisons: comparisons, totalSwaps: swaps };
}
