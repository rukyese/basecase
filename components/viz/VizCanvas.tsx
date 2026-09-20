"use client";

import { MISCONCEPTION_LABELS, type Concept, type VizStore } from "@/lib/viz/types";
import RecursionViz from "./RecursionViz";
import SortingViz from "./SortingViz";
import DerivativeViz from "./DerivativeViz";
import GhostInset from "./GhostInset";

const TITLES: Record<Concept, string> = {
  recursion: "Recursion & the call stack",
  sorting: "Sorting algorithms",
  derivative: "Derivatives / rate of change",
};

export default function VizCanvas({
  store,
  onPatch,
  onCommit,
  resolved,
}: {
  store: VizStore;
  onPatch: (concept: Concept, patch: Record<string, unknown>) => void;
  onCommit?: () => void;
  resolved?: boolean;
}) {
  if (!store.concept) {
    return (
      <div className="viz-canvas viz-empty">
        <svg className="viz-empty-icon" width="72" height="72" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect x="4" y="4" width="24" height="6.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
          <rect x="7.5" y="12.75" width="17" height="6.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
          <rect x="11" y="21.5" width="10" height="6.5" rx="2.5" fill="currentColor" opacity="0.5" />
        </svg>
        <p className="dim">No visualization yet.</p>
        <p className="dim">Ask about recursion, sorting, or derivatives — the picture appears here.</p>
      </div>
    );
  }

  const c = store.concept;
  return (
    <div className="viz-canvas">
      <div className="viz-header">
        <h2>{TITLES[c]}</h2>
        {store.misconceptionId !== "none" && (
          <span className={`misc-chip ${resolved ? "misc-resolved" : ""}`} title={store.misconceptionId}>
            {resolved ? "basecase reached: " : "working theory: "}
            {MISCONCEPTION_LABELS[store.misconceptionId as keyof typeof MISCONCEPTION_LABELS]}
          </span>
        )}
      </div>
      {store.narrationHint && <p className="viz-hint">↳ {store.narrationHint}</p>}
      <GhostInset store={store} resolved={resolved} />
      {c === "recursion" && (
        <RecursionViz state={store.recursion} onChange={(p) => onPatch("recursion", p)} onCommit={onCommit} />
      )}
      {c === "sorting" && (
        <SortingViz state={store.sorting} onChange={(p) => onPatch("sorting", p)} onCommit={onCommit} />
      )}
      {c === "derivative" && (
        <DerivativeViz state={store.derivative} onChange={(p) => onPatch("derivative", p)} onCommit={onCommit} />
      )}
    </div>
  );
}
