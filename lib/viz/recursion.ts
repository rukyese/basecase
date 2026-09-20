// Deterministic recursion trace engine. Given (fn, input) it actually runs the
// recursion and records every call enter/exit, producing:
//   - snapshots: the live call stack at each step (for the stack view)
//   - tree: laid-out call tree nodes (for the diagram)
// The LLM only picks fn/input/step — it never supplies the frames themselves.

import type { RecursionFn } from "./types";

interface FnSpec {
  label: string;
  call: (arg: number) => string;
  maxInput: number;
  eval: (n: number) => { base?: number; children?: number[]; combine?: (rs: number[]) => number };
}

export const RECURSION_FNS: Record<RecursionFn, FnSpec> = {
  fibonacci: {
    label: "fibonacci",
    call: (n) => `fib(${n})`,
    maxInput: 7,
    eval: (n) =>
      n <= 1
        ? { base: n }
        : { children: [n - 1, n - 2], combine: ([a, b]) => a + b },
  },
  factorial: {
    label: "factorial",
    call: (n) => `${n}!`,
    maxInput: 10,
    eval: (n) =>
      n <= 1 ? { base: 1 } : { children: [n - 1], combine: ([a]) => a * n },
  },
  sum: {
    label: "sum",
    call: (n) => `sum(${n})`,
    maxInput: 10,
    eval: (n) =>
      n <= 0 ? { base: 0 } : { children: [n - 1], combine: ([a]) => a + n },
  },
};

export interface RecFrame {
  id: number;
  arg: number;
  depth: number;
  status: "active" | "waiting" | "done";
  ret: number | null;
}

export interface RecSnapshot {
  frames: RecFrame[]; // stack bottom → top
  activeId: number | null;
}

export interface TreeNode {
  id: number;
  parentId: number | null;
  arg: number;
  depth: number;
  ret: number | null;
  x: number; // 0..1 layout coords
  y: number;
  enterStep: number; // snapshot index where this call enters
  exitStep: number; // snapshot index where this call returns
}

export interface RecTrace {
  snapshots: RecSnapshot[];
  nodes: TreeNode[];
  totalCalls: number;
  maxDepth: number;
}

export function buildRecursionTrace(fn: RecursionFn, input: number): RecTrace {
  const spec = RECURSION_FNS[fn];
  const n = Math.max(1, Math.min(spec.maxInput, Math.round(input)));

  const nodes: Omit<TreeNode, "x" | "y" | "enterStep" | "exitStep">[] = [];
  const events: { type: "enter" | "exit"; id: number; ret?: number }[] = [];
  let nextId = 0;

  function call(arg: number, parentId: number | null, depth: number): number {
    const id = nextId++;
    nodes.push({ id, parentId, arg, depth, ret: null });
    events.push({ type: "enter", id });
    const r = spec.eval(arg);
    let ret: number;
    if (r.base !== undefined) {
      ret = r.base;
    } else {
      const rs = (r.children ?? []).map((c) => call(c, id, depth + 1));
      ret = r.combine ? r.combine(rs) : 0;
    }
    nodes[id].ret = ret;
    events.push({ type: "exit", id, ret });
    return ret;
  }
  call(n, null, 0);

  // replay events into stack snapshots
  const snapshots: RecSnapshot[] = [];
  const stack: RecFrame[] = [];
  const enterStep = new Map<number, number>();
  const exitStepMap = new Map<number, number>();
  for (const ev of events) {
    if (ev.type === "enter") {
      const top = stack[stack.length - 1];
      if (top) top.status = "waiting";
      stack.push({ id: ev.id, arg: nodes[ev.id].arg, depth: nodes[ev.id].depth, status: "active", ret: null });
      enterStep.set(ev.id, snapshots.length);
    } else {
      const top = stack[stack.length - 1];
      if (top && top.id === ev.id) {
        // keep the frame on the stack for this snapshot, marked done, so the
        // UI can flash the returned value before it pops
        top.ret = ev.ret ?? null;
        top.status = "done";
      }
    }
    if (ev.type === "exit") exitStepMap.set(ev.id, snapshots.length);
    const top = stack[stack.length - 1];
    snapshots.push({
      frames: stack.map((f) => ({ ...f })),
      activeId: ev.type === "exit" ? ev.id : top ? top.id : null,
    });
    if (ev.type === "exit") {
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.status = "active";
    }
  }

  // tree layout: leaves get sequential x, internal nodes sit above their
  // children's midpoint; y = depth
  const children = new Map<number, number[]>();
  for (const nd of nodes) {
    if (nd.parentId !== null) {
      const list = children.get(nd.parentId) ?? [];
      list.push(nd.id);
      children.set(nd.parentId, list);
    }
  }
  const xPos = new Map<number, number>();
  let leafCount = 0;
  function layout(id: number): number {
    const kids = children.get(id);
    if (!kids || kids.length === 0) {
      const x = leafCount++;
      xPos.set(id, x);
      return x;
    }
    const xs = kids.map(layout);
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    xPos.set(id, x);
    return x;
  }
  layout(0);
  const maxDepth = Math.max(...nodes.map((nd) => nd.depth));
  const xMax = Math.max(1, leafCount - 1);

  const laid: TreeNode[] = nodes.map((nd) => ({
    ...nd,
    x: xPos.get(nd.id)! / xMax,
    y: maxDepth === 0 ? 0 : nd.depth / maxDepth,
    enterStep: enterStep.get(nd.id) ?? 0,
    exitStep: exitStepMap.get(nd.id) ?? snapshots.length - 1,
  }));

  return { snapshots, nodes: laid, totalCalls: nodes.length, maxDepth: maxDepth + 1 };
}
