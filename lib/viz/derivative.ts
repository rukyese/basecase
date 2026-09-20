// Derivative function registry. Each entry carries f and its analytic f′ so
// slopes are exact — the model picks a key, never supplies math.

import type { DerivativeFnKey } from "./types";

export interface DerivFn {
  label: string;
  f: (x: number) => number;
  d: (x: number) => number;
  aliases: string[];
}

export const DERIV_FNS: Record<DerivativeFnKey, DerivFn> = {
  x2: { label: "x²", f: (x) => x * x, d: (x) => 2 * x, aliases: ["x^2", "x²", "x**2", "x squared", "x*x"] },
  x3: { label: "x³", f: (x) => x ** 3, d: (x) => 3 * x * x, aliases: ["x^3", "x³", "x**3", "x cubed"] },
  sin: { label: "sin x", f: Math.sin, d: Math.cos, aliases: ["sin", "sin(x)", "sinx", "sine"] },
  x2m2x: {
    label: "x²−2x",
    f: (x) => x * x - 2 * x,
    d: (x) => 2 * x - 2,
    aliases: ["x^2-2x", "x²−2x", "x^2 - 2x"],
  },
};

export function matchDerivFn(raw: unknown): DerivativeFnKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase().replace(/\s+/g, "");
  for (const [key, fn] of Object.entries(DERIV_FNS)) {
    if (key === s || fn.aliases.some((a) => a.toLowerCase().replace(/\s+/g, "") === s)) {
      return key as DerivativeFnKey;
    }
  }
  return null;
}
