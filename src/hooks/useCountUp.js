import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Anima un número desde su valor anterior hasta el nuevo (ease-out). Si el
// sistema pide menos movimiento, devuelve el valor final de inmediato.
export function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) { setValue(target); return undefined; }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target - from) * eased;
      fromRef.current = next;
      setValue(progress === 1 ? target : next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
