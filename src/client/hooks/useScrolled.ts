import { useEffect, useState } from "react";

/**
 * 页面是否已滚过阈值。用于顶栏从常态收缩成紧凑态。
 *
 * 只在跨越阈值时 setState，不是每次 scroll 都更新：滚动事件一秒能触发上百次，
 * 每次都进 React 渲染会把主线程占满。监听器加 passive，避免阻塞滚动合成。
 */
export function useScrolled(threshold = 12): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const next = window.scrollY > threshold;
      setScrolled((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
