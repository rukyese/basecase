"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { buildSortTrace, SORT_ALGOS } from "@/lib/viz/sorting";
import { randomItems, type SortingVizState, type SortAlgorithm } from "@/lib/viz/types";
import { ChipRow, SpeedChips, Stepper, Transport, useAutoplay } from "./controls";

export default function SortingViz({
  state,
  onChange,
  onCommit,
}: {
  state: SortingVizState;
  onChange: (patch: Partial<SortingVizState>) => void;
  onCommit?: () => void;
}) {
  const trace = useMemo(() => buildSortTrace(state.algorithm, state.items), [state.algorithm, state.items]);
  const stepIndex = Math.min(state.stepIndex, trace.steps.length - 1);
  const step = trace.steps[stepIndex];
  const byId = useMemo(() => new Map(state.items.map((it) => [it.id, it])), [state.items]);
  const maxV = Math.max(...state.items.map((i) => i.v), 1);

  useAutoplay(state.playing, stepIndex, trace.steps.length - 1, (i) =>
    onChange({ stepIndex: i, playing: i < trace.steps.length - 1 }),
    state.speedMs
  );

  const comparingIds = new Set(
    (step?.comparing ?? []).map((pos) => step!.order[pos]).filter((id) => id !== undefined)
  );

  return (
    <div className="viz-body">
      <div className="viz-stats">
        <span>
          comparisons: <b className="stat-compare">{step?.comparisons ?? 0}</b>
        </span>
        <span>
          swaps: <b className="stat-swap">{step?.swaps ?? 0}</b>
        </span>
        <span className="dim">
          step {stepIndex}/{trace.steps.length - 1} · pass {step?.pass ?? 0}
        </span>
      </div>

      <div className="bars-row">
        {step.order.map((id, pos) => {
          const it = byId.get(id)!;
          const isComparing = comparingIds.has(id);
          const isSorted = pos >= step.sortedFrom;
          return (
            <motion.div key={id} layout transition={{ type: "spring", stiffness: 420, damping: 32 }} className="bar-wrap">
              <div
                className={`bar ${isComparing ? (step.swapped ? "bar-swapped" : "bar-comparing") : ""} ${
                  isSorted ? "bar-sorted" : ""
                }`}
                style={{ height: `${(it.v / maxV) * 100}%` }}
              />
              <div className={`bar-label ${isComparing ? "bar-label-on" : ""}`}>{it.v}</div>
            </motion.div>
          );
        })}
      </div>
      <div className="bars-ruler">
        {step.order.map((_, pos) => (
          <span key={pos} className={step.comparing?.includes(pos) ? "ruler-on" : ""}>
            {pos}
          </span>
        ))}
      </div>

      <div className="viz-legend">
        <span className="legend compare">comparing</span>
        <span className="legend swap">swapped</span>
        <span className="legend sorted">sorted</span>
      </div>

      <div className="viz-controls">
        <ChipRow<SortAlgorithm>
          options={(["bubble", "selection", "insertion"] as const).map((k) => ({
            key: k,
            label: SORT_ALGOS[k],
          }))}
          value={state.algorithm}
          onChange={(algorithm) => {
            onChange({ algorithm, stepIndex: 0, playing: false });
            onCommit?.();
          }}
        />
        <Stepper
          label="elements"
          value={state.items.length}
          min={4}
          max={10}
          onChange={(n) => {
            onChange({ items: randomItems(n), stepIndex: 0, playing: false });
            onCommit?.();
          }}
        />
        <button
          className="chip"
          onClick={() => {
            onChange({ items: randomItems(state.items.length), stepIndex: 0, playing: false });
            onCommit?.();
          }}
        >
          shuffle
        </button>
        <Transport
          playing={state.playing}
          canBack={stepIndex > 0}
          canFwd={stepIndex < trace.steps.length - 1}
          onPlay={(playing) => {
            onChange({ playing, stepIndex: stepIndex >= trace.steps.length - 1 ? 0 : stepIndex });
            onCommit?.();
          }}
          onBack={() => onChange({ stepIndex: stepIndex - 1, playing: false })}
          onFwd={() => onChange({ stepIndex: stepIndex + 1, playing: false })}
        />
        <SpeedChips
          speedMs={state.speedMs}
          onChange={(speedMs) => {
            onChange({ speedMs });
            onCommit?.();
          }}
        />
      </div>
    </div>
  );
}
