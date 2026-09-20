"use client";

// Misconception ghost — renders the student's *wrong* mental model as a
// small inset next to the real visualization, so the contrast is visible
// rather than just narrated. Appears automatically when the agent sets a
// matching misconception_id; disappears when it's resolved.

import { buildRecursionTrace, RECURSION_FNS } from "@/lib/viz/recursion";
import { DERIV_FNS } from "@/lib/viz/derivative";
import type { VizStore } from "@/lib/viz/types";

const CAPTIONS: Record<string, string> = {
  recursion_m1: "your model: one frame, overwritten each call",
  recursion_m2: "your model: depth ≈ total calls",
  sorting_m1: "your model: every pair compared at the same time",
  sorting_m2: "your model: every comparison causes a swap",
  derivative_m1: "your model: f′(x) = f(x) — value, not slope",
  derivative_m2: "your model: secant is just another line",
};

function RecursionGhost({ store }: { store: VizStore }) {
  const r = store.recursion;
  const t = buildRecursionTrace(r.fn, r.input);
  const snap = t.snapshots[Math.min(r.stepIndex, t.snapshots.length - 1)];
  const activeArg = snap?.activeId != null ? t.nodes[snap.activeId].arg : r.input;
  const call = RECURSION_FNS[r.fn].call;

  if (store.misconceptionId === "recursion_m1") {
    // the wrong model: a single slot whose contents get overwritten
    return (
      <div className="ghost-body">
        <div className="ghost-stack">
          <div className="ghost-frame ghost-flash" key={snap?.activeId ?? "idle"}>
            {snap?.activeId != null ? call(activeArg) : "—"}
          </div>
        </div>
        <span className="ghost-note">one slot, overwritten</span>
      </div>
    );
  }
  // recursion_m2: depth confused for total calls — show the false equation
  return (
    <div className="ghost-body">
      <div className="ghost-eq">
        <s>calls ≈ depth = {t.maxDepth}</s>
        <span className="ghost-truth">actual calls: {t.totalCalls}</span>
      </div>
    </div>
  );
}

function SortingGhost({ store }: { store: VizStore }) {
  const items = store.sorting.items;
  const max = Math.max(...items.map((i) => i.v));
  const isSwapGhost = store.misconceptionId === "sorting_m2";
  return (
    <div className="ghost-body">
      <div className="ghost-bars">
        {items.map((it) => (
          <div
            key={it.id}
            className={`ghost-bar ${isSwapGhost ? "ghost-swap" : "ghost-compare"}`}
            style={{ height: `${(it.v / max) * 100}%` }}
          />
        ))}
      </div>
      <span className="ghost-note">
        {isSwapGhost ? "every compare → swap" : "all pairs at once"}
      </span>
    </div>
  );
}

function DerivativeGhost({ store }: { store: VizStore }) {
  const d = store.derivative;
  const spec = DERIV_FNS[d.fn];
  const W = 200;
  const H = 72;
  const pad = 6;

  // sample f over the range — for m1 this IS the claimed "derivative" curve
  const N = 60;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = -d.range + (i / N) * 2 * d.range;
    pts.push([x, spec.f(x)]);
  }
  const ys = pts.map((p) => p[1]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const sx = (x: number) => pad + ((x + d.range) / (2 * d.range)) * (W - 2 * pad);
  const sy = (y: number) =>
    H - pad - ((y - yMin) / Math.max(1e-6, yMax - yMin)) * (H - 2 * pad);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");

  if (store.misconceptionId === "derivative_m1") {
    return (
      <div className="ghost-body">
        <svg width={W} height={H} className="ghost-svg">
          <path d={path} className="ghost-curve" />
          <text x={W - pad} y={pad + 9} textAnchor="end" className="ghost-svg-label">
            “f′” = f
          </text>
        </svg>
      </div>
    );
  }
  // derivative_m2: a static secant that never shrinks — "just another line"
  const x0 = d.pointX;
  const x1 = d.pointX + 2;
  const y0 = spec.f(x0);
  const y1 = spec.f(x1);
  const m = (y1 - y0) / (x1 - x0);
  const lx0 = -d.range;
  const lx1 = d.range;
  return (
    <div className="ghost-body">
      <svg width={W} height={H} className="ghost-svg">
        <path d={path} className="ghost-curve-faint" />
        <line
          x1={sx(lx0)}
          y1={sy(y0 + m * (lx0 - x0))}
          x2={sx(lx1)}
          y2={sy(y0 + m * (lx1 - x0))}
          className="ghost-line"
        />
      </svg>
      <span className="ghost-note">a fixed chord, not a limit</span>
    </div>
  );
}

export default function GhostInset({ store, resolved }: { store: VizStore; resolved?: boolean }) {
  const id = store.misconceptionId;
  if (!store.concept || id === "none" || !(id in CAPTIONS)) return null;
  // ghost only exists for the concept it belongs to
  if (!id.startsWith(store.concept)) return null;

  return (
    <div className={`ghost-inset ${resolved ? "ghost-defeated" : ""}`}>
      <span className="ghost-label">
        {resolved ? "the model you described — debunked" : "the model you described"}
      </span>
      {store.concept === "recursion" && <RecursionGhost store={store} />}
      {store.concept === "sorting" && <SortingGhost store={store} />}
      {store.concept === "derivative" && <DerivativeGhost store={store} />}
      <span className="ghost-caption">{CAPTIONS[id]}</span>
    </div>
  );
}
