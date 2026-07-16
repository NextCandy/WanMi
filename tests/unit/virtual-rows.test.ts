import { describe, expect, it } from "vitest";

import { chunkIds, computeVisibleRange, hasMoreRows } from "../../src/client/lib/virtual-rows";

const base = { viewportHeight: 800, rowHeight: 80, count: 862, overscan: 5 };

describe("虚拟滚动可见区间", () => {
  it("列表顶部仍在视口内时从第一行开始渲染", () => {
    expect(computeVisibleRange({ ...base, listTop: 0 })).toEqual({ start: 0, end: 15 });
  });

  it("向下滚动后跟随视口推进区间", () => {
    expect(computeVisibleRange({ ...base, listTop: -4000 })).toEqual({ start: 45, end: 65 });
  });

  it("滚到列表末尾时区间不会越过总行数", () => {
    const range = computeVisibleRange({ ...base, listTop: -(862 * 80) });
    expect(range.end).toBe(862);
    expect(range.start).toBeLessThan(range.end);
  });

  it("列表还在视口下方时不会算出负的起点", () => {
    expect(computeVisibleRange({ ...base, listTop: 200 }).start).toBe(0);
  });

  it("空列表或行高未测出时不渲染任何行", () => {
    expect(computeVisibleRange({ ...base, listTop: 0, count: 0 })).toEqual({ start: 0, end: 0 });
    expect(computeVisibleRange({ ...base, listTop: 0, rowHeight: 0 })).toEqual({ start: 0, end: 0 });
  });
});

describe("累积分页", () => {
  it("已加载数小于总数时还有下一页", () => {
    expect(hasMoreRows(100, 862)).toBe(true);
    expect(hasMoreRows(862, 862)).toBe(false);
    expect(hasMoreRows(0, 0)).toBe(false);
  });
});

describe("批量 id 分批", () => {
  it("862 个选中按 500 上限拆成两批且不丢 id", () => {
    const ids = Array.from({ length: 862 }, (_, index) => index + 1);
    const chunks = chunkIds(ids, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(362);
    expect(chunks.flat()).toEqual(ids);
  });

  it("未超过上限时只发一批", () => {
    expect(chunkIds([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });

  it("没有选中时不产生请求", () => {
    expect(chunkIds([], 500)).toEqual([]);
  });

  it("分批大小非法时直接报错而不是死循环", () => {
    expect(() => chunkIds([1, 2], 0)).toThrow("分批大小必须大于 0");
  });
});
