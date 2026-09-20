"use client";

import { useEffect, useRef } from "react";

// Small shared control primitives so all three vizzes feel consistent.

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chip-row">
      {options.map((o) => (
        <button
          key={o.key}
          className={`chip ${o.key === value ? "chip-on" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderRow({
  label,
  min,
  max,
  step = 1,
  value,
  display,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  display?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  return (
    <label className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onMouseUp={() => onCommit?.(value)}
        onTouchEnd={() => onCommit?.(value)}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") onCommit?.(value);
        }}
      />
      <span className="slider-val">{display ?? value}</span>
    </label>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <span className="slider-label">{label}</span>
      <button className="step-btn" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="slider-val">{value}</span>
      <button className="step-btn" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function Transport({
  playing,
  canBack,
  canFwd,
  onPlay,
  onBack,
  onFwd,
}: {
  playing: boolean;
  canBack: boolean;
  canFwd: boolean;
  onPlay: (p: boolean) => void;
  onBack: () => void;
  onFwd: () => void;
}) {
  return (
    <div className="transport">
      <button className="step-btn" disabled={!canBack} onClick={onBack} title="step back">
        ◀
      </button>
      <button className="step-btn play" onClick={() => onPlay(!playing)} title={playing ? "pause" : "play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button className="step-btn" disabled={!canFwd} onClick={onFwd} title="step forward">
        ▶︎
      </button>
    </div>
  );
}

const SPEED_OPTIONS = [
  { key: "1400", label: "0.5×" },
  { key: "700", label: "1×" },
  { key: "350", label: "2×" },
] as const;

export function SpeedChips({
  speedMs,
  onChange,
}: {
  speedMs: number;
  onChange: (ms: number) => void;
}) {
  return (
    <ChipRow
      options={SPEED_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
      value={String(speedMs) as "1400"}
      onChange={(k) => onChange(+k)}
    />
  );
}

// Drives stepIndex while `playing` is true. Lives in the component so the same
// mechanism serves agent-triggered play and the student's play button.
export function useAutoplay(playing: boolean, stepIndex: number, maxStep: number, onStep: (i: number) => void, ms = 700) {
  const cb = useRef(onStep);
  useEffect(() => {
    cb.current = onStep;
  });
  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= maxStep) {
      cb.current(maxStep); // parent should set playing=false
      return;
    }
    const t = window.setTimeout(() => cb.current(stepIndex + 1), ms);
    return () => window.clearTimeout(t);
  }, [playing, stepIndex, maxStep, ms]);
}
