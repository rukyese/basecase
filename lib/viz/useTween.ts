import { useEffect, useRef, useState } from "react";

// Tweens a displayed number toward its target (used for secant_dx shrinking
// toward 0 so secant→tangent animates instead of snapping).
export function useTweenedNumber(target: number, durationMs = 500): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);

  useEffect(() => {
    if (value === target) return;
    fromRef.current = value;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      const v = fromRef.current + (target - fromRef.current) * eased;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
