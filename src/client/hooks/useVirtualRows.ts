import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { computeVisibleRange, type VisibleRange } from "../lib/virtual-rows";

const OVERSCAN = 6;

export interface UseVirtualRowsOptions {
  count: number;
  /** 移动端表格是卡片式布局、行高不固定，此时关闭虚拟化直接整段渲染 */
  enabled: boolean;
  estimatedRowHeight: number;
  /** 影响行高的外部状态（例如可选列开关）变化时重新测量 */
  measureKey: string;
}

export interface UseVirtualRowsResult {
  containerRef: React.RefObject<HTMLTableSectionElement | null>;
  start: number;
  end: number;
  topPad: number;
  bottomPad: number;
  rowHeight: number;
}

/**
 * 表格虚拟滚动：跟随页面滚动，只渲染视口附近的行，上下用占位行补足高度。
 * 行高由首个真实行测量得到，因此列显示切换后仍然准确。
 */
export function useVirtualRows({
  count,
  enabled,
  estimatedRowHeight,
  measureKey,
}: UseVirtualRowsOptions): UseVirtualRowsResult {
  const containerRef = useRef<HTMLTableSectionElement | null>(null);
  const frameRef = useRef(0);
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight);
  const [range, setRange] = useState<VisibleRange>({ start: 0, end: count });

  useLayoutEffect(() => {
    if (!enabled || count === 0) return;
    const row = containerRef.current?.querySelector<HTMLElement>("[data-virtual-row]");
    if (!row) return;
    const measured = row.getBoundingClientRect().height;
    if (measured > 0 && Math.abs(measured - rowHeight) > 0.5) setRowHeight(measured);
  }, [enabled, count, measureKey, rowHeight]);

  const update = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = computeVisibleRange({
      listTop: container.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      rowHeight,
      count,
      overscan: OVERSCAN,
    });
    setRange((current) => (current.start === next.start && current.end === next.end ? current : next));
  }, [count, rowHeight]);

  useEffect(() => {
    if (!enabled) {
      setRange((current) => (current.start === 0 && current.end === count ? current : { start: 0, end: count }));
      return;
    }
    // 每帧最多重算一次，避免滚动时逐事件触发渲染
    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [enabled, update, count]);

  const start = enabled ? Math.min(range.start, count) : 0;
  const end = enabled ? Math.min(range.end, count) : count;
  return {
    containerRef,
    start,
    end,
    topPad: enabled ? start * rowHeight : 0,
    bottomPad: enabled ? Math.max(0, (count - end) * rowHeight) : 0,
    rowHeight,
  };
}

/** 表格在 720px 以下切换为卡片式布局，此断点需与 app.css 保持一致 */
export function useIsCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return compact;
}
