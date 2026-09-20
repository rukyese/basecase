"use client";

import { useMemo, useRef } from "react";
import { DERIV_FNS } from "@/lib/viz/derivative";
import { useTweenedNumber } from "@/lib/viz/useTween";
import type { DerivativeVizState, DerivativeFnKey } from "@/lib/viz/types";
import { ChipRow, SliderRow } from "./controls";

const W = 460;
const H = 300;
const PW = 210; // side panel
const PH = 160;

export default function DerivativeViz({
  state,
  onChange,
  onCommit,
}: {
  state: DerivativeVizState;
  onChange: (patch: Partial<DerivativeVizState>) => void;
  onCommit?: () => void;
}) {
  const fn = DERIV_FNS[state.fn];
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const range = state.range;
  const h = useTweenedNumber(state.secantDx);

  // y-domain from sampled f over the x-range
  const { ymin, ymax } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const x = -range + (i / 200) * 2 * range;
      const y = fn.f(x);
      if (Number.isFinite(y)) {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    const pad = (hi - lo) * 0.12 || 1;
    return { ymin: lo - pad, ymax: hi + pad };
  }, [fn, range]);

  const mx = (x: number) => ((x + range) / (2 * range)) * W;
  const my = (y: number) => H - ((y - ymin) / (ymax - ymin)) * H;

  const curve = useMemo(() => {
    let d = "";
    for (let i = 0; i <= 240; i++) {
      const x = -range + (i / 240) * 2 * range;
      const y = fn.f(x);
      if (!Number.isFinite(y)) continue;
      d += `${i === 0 ? "M" : "L"}${mx(x).toFixed(1)},${my(y).toFixed(1)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, range, ymin, ymax]);

  const px = state.pointX;
  const py = fn.f(px);
  const slope = fn.d(px);

  const lineAt = (m: number, x0: number, y0: number) => ({
    x1: -range,
    y1: y0 + m * (-range - x0),
    x2: range,
    y2: y0 + m * (range - x0),
  });
  const tangent = lineAt(slope, px, py);
  const hx = px + h;
  const secantSlope = h > 1e-4 ? (fn.f(hx) - py) / h : slope;
  const secant = h > 1e-4 ? lineAt(secantSlope, px, py) : null;

  function svgPoint(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    return Math.max(-range, Math.min(range, fx * 2 * range - range));
  }

  // side panel plots f and f′ together — the m1 refutation
  const panel = useMemo(() => {
    const lo = Math.min(ymin, ...sample(fn.d, range).map(([, y]) => y));
    const hi = Math.max(ymax, ...sample(fn.d, range).map(([, y]) => y));
    const pmx = (x: number) => ((x + range) / (2 * range)) * PW;
    const pmy = (y: number) => PH - ((y - lo) / (hi - lo || 1)) * PH;
    const path = (g: (x: number) => number) => {
      let d = "";
      sample(g, range).forEach(([x, y], i) => {
        d += `${i === 0 ? "M" : "L"}${pmx(x).toFixed(1)},${pmy(y).toFixed(1)}`;
      });
      return d;
    };
    return { pathF: path(fn.f), pathD: path(fn.d), pmx, pmy, lo, hi };
  }, [fn, range, ymin, ymax]);

  return (
    <div className="viz-body">
      <div className="viz-stats">
        <span>
          x = <b>{px.toFixed(2)}</b>
        </span>
        <span>
          f(x) = <b className="stat-compare">{py.toFixed(2)}</b> <i className="dim">(value)</i>
        </span>
        <span>
          f′(x) = <b className="stat-swap">{slope.toFixed(2)}</b> <i className="dim">(slope — not the same thing)</i>
        </span>
      </div>

      <div className="deriv-panels">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="deriv-svg"
          onPointerMove={(e) => {
            if (!dragging.current) return;
            onChange({ pointX: +svgPoint(e.clientX).toFixed(2) });
          }}
          onPointerUp={() => {
            dragging.current = false;
            onCommit?.();
          }}
        >
          {/* axes */}
          <line x1={0} y1={my(0)} x2={W} y2={my(0)} className="axis" />
          <line x1={mx(0)} y1={0} x2={mx(0)} y2={H} className="axis" />
          <path d={curve} className="curve" />

          {secant && (
            <>
              <line x1={mx(secant.x1)} y1={my(secant.y1)} x2={mx(secant.x2)} y2={my(secant.y2)} className="secant" />
              <circle cx={mx(hx)} cy={my(fn.f(hx))} r={5} className="pt-secant" />
              <text x={mx(hx) + 8} y={my(fn.f(hx)) - 8} className="svg-label">
                x+h, h={h.toFixed(2)}
              </text>
            </>
          )}

          <line x1={mx(tangent.x1)} y1={my(tangent.y1)} x2={mx(tangent.x2)} y2={my(tangent.y2)} className="tangent" />

          <circle
            cx={mx(px)}
            cy={my(py)}
            r={9}
            className="pt-main"
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
          />
          <text x={mx(px) + 10} y={my(py) + 18} className="svg-label">
            drag me
          </text>
        </svg>

        {state.showFxPanel && (
          <svg viewBox={`0 0 ${PW} ${PH}`} className="deriv-panel">
            <line x1={0} y1={panel.pmy(0)} x2={PW} y2={panel.pmy(0)} className="axis" />
            <path d={panel.pathF} className="curve thin" />
            <path d={panel.pathD} className="tangent thin" />
            <line x1={panel.pmx(px)} y1={0} x2={panel.pmx(px)} y2={PH} className="marker" />
            <text x={6} y={14} className="svg-label">
              f(x) solid · f′(x) amber
            </text>
          </svg>
        )}
      </div>

      <div className="viz-controls">
        <ChipRow<DerivativeFnKey>
          options={(Object.keys(DERIV_FNS) as DerivativeFnKey[]).map((k) => ({ key: k, label: DERIV_FNS[k].label }))}
          value={state.fn}
          onChange={(fk) => {
            onChange({ fn: fk });
            onCommit?.();
          }}
        />
        <SliderRow
          label="x"
          min={-range}
          max={range}
          step={0.05}
          value={px}
          display={px.toFixed(2)}
          onChange={(v) => onChange({ pointX: v })}
          onCommit={() => onCommit?.()}
        />
        <SliderRow
          label="h (secant gap)"
          min={0}
          max={3}
          step={0.05}
          value={state.secantDx}
          display={state.secantDx < 0.05 ? "≈ tangent" : state.secantDx.toFixed(2)}
          onChange={(v) => onChange({ secantDx: v })}
          onCommit={() => onCommit?.()}
        />
        <SliderRow
          label="range"
          min={2}
          max={10}
          step={1}
          value={range}
          onChange={(v) => {
            onChange({ range: v, pointX: Math.max(-v, Math.min(v, px)) });
            onCommit?.();
          }}
        />
      </div>
    </div>
  );
}

function sample(g: (x: number) => number, range: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const x = -range + (i / 120) * 2 * range;
    const y = g(x);
    if (Number.isFinite(y)) pts.push([x, y]);
  }
  return pts;
}
