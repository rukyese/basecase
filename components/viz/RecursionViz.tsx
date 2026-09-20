"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { buildRecursionTrace, RECURSION_FNS } from "@/lib/viz/recursion";
import type { RecursionVizState, RecursionFn } from "@/lib/viz/types";
import { ChipRow, SpeedChips, Stepper, Transport, useAutoplay } from "./controls";

export default function RecursionViz({
  state,
  onChange,
  onCommit,
}: {
  state: RecursionVizState;
  onChange: (patch: Partial<RecursionVizState>) => void;
  onCommit?: () => void;
}) {
  const spec = RECURSION_FNS[state.fn];
  const trace = useMemo(() => buildRecursionTrace(state.fn, state.input), [state.fn, state.input]);
  const stepIndex = Math.min(state.stepIndex, trace.snapshots.length - 1);
  const snap = trace.snapshots[stepIndex];
  const callsMade = trace.nodes.filter((nd) => nd.enterStep <= stepIndex).length;

  useAutoplay(state.playing, stepIndex, trace.snapshots.length - 1, (i) =>
    onChange({ stepIndex: i, playing: i < trace.snapshots.length - 1 }),
    state.speedMs
  );

  const W = 300;
  const H = 200;
  const pad = 18;

  return (
    <div className="viz-body">
      <div className="viz-stats">
        <span>
          calls made: <b>{callsMade}</b> / {trace.totalCalls}
        </span>
        <span>
          stack depth now: <b>{snap?.frames.length ?? 0}</b> / {trace.maxDepth}
        </span>
      </div>

      <div className="rec-panels">
        <div className="rec-stack" title="call stack — newest call on top">
          <div className="panel-label">call stack</div>
          <div className="stack-col">
            <AnimatePresence initial={false}>
              {snap?.frames.map((f) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: -14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  className={`frame frame-${f.status} ${
                    state.highlight === "return_value" && f.ret !== null ? "frame-hl" : ""
                  }`}
                >
                  <span className="frame-call">{spec.call(f.arg)}</span>
                  <span className="frame-meta">
                    {f.status === "waiting" && "paused…"}
                    {f.status === "active" && "running"}
                    {f.status === "done" && `→ ${f.ret}`}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {(!snap || snap.frames.length === 0) && <div className="dim">stack empty</div>}
          </div>
        </div>

        <div className="rec-tree">
          <div className="panel-label">call tree — click a node to jump to it</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="tree-svg">
            {trace.nodes.map(
              (nd) =>
                nd.parentId !== null && (
                  <line
                    key={`e${nd.id}`}
                    x1={pad + trace.nodes[nd.parentId].x * (W - 2 * pad)}
                    y1={pad + trace.nodes[nd.parentId].y * (H - 2 * pad)}
                    x2={pad + nd.x * (W - 2 * pad)}
                    y2={pad + nd.y * (H - 2 * pad)}
                    className="tree-edge"
                  />
                )
            )}
            {trace.nodes.map((nd) => {
              const resolved = nd.exitStep <= stepIndex;
              const active = snap?.activeId === nd.id;
              const onStack = snap?.frames.some((f) => f.id === nd.id);
              return (
                <g key={nd.id} onClick={() => onChange({ stepIndex: nd.enterStep, playing: false })} className="tree-node">
                  <circle
                    cx={pad + nd.x * (W - 2 * pad)}
                    cy={pad + nd.y * (H - 2 * pad)}
                    r={10}
                    className={`tree-dot ${active ? "tree-active" : ""} ${resolved ? "tree-done" : onStack ? "tree-waiting" : ""}`}
                  />
                  <text
                    x={pad + nd.x * (W - 2 * pad)}
                    y={pad + nd.y * (H - 2 * pad) + 3}
                    className="tree-text"
                  >
                    {nd.arg}
                  </text>
                  {resolved && (
                    <text
                      x={pad + nd.x * (W - 2 * pad)}
                      y={pad + nd.y * (H - 2 * pad) - 13}
                      className="tree-ret"
                    >
                      {nd.ret}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="viz-controls">
        <ChipRow<RecursionFn>
          options={[
            { key: "fibonacci", label: "fibonacci" },
            { key: "factorial", label: "factorial" },
            { key: "sum", label: "sum" },
          ]}
          value={state.fn}
          onChange={(fn) => {
            onChange({ fn, input: Math.min(state.input, RECURSION_FNS[fn].maxInput), stepIndex: 0, playing: false });
            onCommit?.();
          }}
        />
        <Stepper
          label="n"
          value={state.input}
          min={1}
          max={spec.maxInput}
          onChange={(input) => {
            onChange({ input, stepIndex: 0, playing: false });
            onCommit?.();
          }}
        />
        <Transport
          playing={state.playing}
          canBack={stepIndex > 0}
          canFwd={stepIndex < trace.snapshots.length - 1}
          onPlay={(playing) => {
            onChange({ playing, stepIndex: stepIndex >= trace.snapshots.length - 1 ? 0 : stepIndex });
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
