export interface VisibleRange {
  start: number;
  end: number;
}

export interface VisibleRangeInput {
  /** 列表容器顶边相对视口顶部的距离；向上滚出视口后为负值 */
  listTop: number;
  viewportHeight: number;
  rowHeight: number;
  count: number;
  overscan: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 按页面滚动位置推算需要真实渲染的行区间，区间外用占位行撑高。
 * listTop 取自容器的 getBoundingClientRect().top，因此列表使用页面滚动即可，
 * 不需要把表格改成独立的内部滚动容器。
 */
export function computeVisibleRange({
  listTop,
  viewportHeight,
  rowHeight,
  count,
  overscan,
}: VisibleRangeInput): VisibleRange {
  if (count <= 0 || rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: 0 };
  const scrolledPast = Math.max(0, -listTop);
  const first = Math.floor(scrolledPast / rowHeight) - overscan;
  const last = Math.ceil((scrolledPast + viewportHeight) / rowHeight) + overscan;
  const start = clamp(first, 0, count);
  return { start, end: clamp(last, start, count) };
}

/** 累积分页时用已加载条数和总数判断是否还有下一页 */
export function hasMoreRows(loaded: number, total: number): boolean {
  return loaded < total;
}

/**
 * 后端批量接口对 ids 数量有上限，选中数超过上限时前端按上限切分成多批。
 */
export function chunkIds(ids: number[], size: number): number[][] {
  if (size <= 0) throw new Error("分批大小必须大于 0");
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}
