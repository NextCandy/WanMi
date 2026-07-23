import { useEffect, useRef, useState } from "react";

/**
 * KPI 数字从 0 滚到目标值。
 *
 * 只在目标值「首次拿到」时跑一次：概览会随数据版本轮询重渲染，每次都重播会让
 * 数字不停跳动。目标值真的变了（后台改了数据）则从当前显示值滚到新值，不回到 0。
 *
 * prefers-reduced-motion 下直接给终值，不做任何插值。
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(() => (prefersReduced() ? target : 0));
  const fromRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic：起步快、收尾稳，读数不会在末尾卡住
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      fromRef.current = next;
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return value;
}

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
