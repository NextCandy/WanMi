import { describe, expect, it } from "vitest";

import { buildLogTrend, groupLogAction, summarizeLogGroups } from "../../src/shared/log-analytics";

describe("日志操作分组", () => {
  it("批量动作优先归入批量，不被 delete/update 规则截胡", () => {
    expect(groupLogAction("domains.bulk.delete")).toBe("bulk");
    expect(groupLogAction("domains.bulk.feature")).toBe("bulk");
    expect(groupLogAction("domains.bulk.keywords")).toBe("bulk");
  });

  it("按后缀归入创建、更新与删除", () => {
    expect(groupLogAction("domains.create")).toBe("create");
    expect(groupLogAction("ai.config.create")).toBe("create");
    expect(groupLogAction("settings.update")).toBe("update");
    expect(groupLogAction("domains.delete")).toBe("delete");
  });

  it("其余动作归入其他", () => {
    expect(groupLogAction("auth.login")).toBe("other");
    expect(groupLogAction("domains.import")).toBe("other");
    expect(groupLogAction("domains.export")).toBe("other");
  });
});

describe("近 7 天操作趋势", () => {
  const rows = [
    { day: "2026-07-17", action: "domains.create", count: 3 },
    { day: "2026-07-17", action: "domains.bulk.delete", count: 2 },
    { day: "2026-07-15", action: "settings.update", count: 1 },
  ];

  it("补齐 7 个连续日期，没有日志的那天为 0", () => {
    const trend = buildLogTrend(rows, "2026-07-17");
    expect(trend).toHaveLength(7);
    expect(trend[0].day).toBe("2026-07-11");
    expect(trend[6].day).toBe("2026-07-17");
    expect(trend[1].total).toBe(0);
  });

  it("按分组累加当天计数，批量删除不计入删除", () => {
    const trend = buildLogTrend(rows, "2026-07-17");
    expect(trend[6].total).toBe(5);
    expect(trend[6].create).toBe(3);
    expect(trend[6].bulk).toBe(2);
    expect(trend[6].delete).toBe(0);
    expect(trend[4].update).toBe(1);
  });

  it("X 轴标签取月日", () => {
    expect(buildLogTrend([], "2026-07-17")[6].label).toBe("07-17");
  });

  it("窗口外的日志不计入", () => {
    const trend = buildLogTrend([{ day: "2026-07-01", action: "domains.create", count: 9 }], "2026-07-17");
    expect(trend.every((point) => point.total === 0)).toBe(true);
  });

  it("跨月回溯日期正确", () => {
    expect(buildLogTrend([], "2026-03-01")[0].day).toBe("2026-02-23");
  });

  it("分组合计覆盖整个窗口", () => {
    expect(summarizeLogGroups(buildLogTrend(rows, "2026-07-17"))).toEqual({
      create: 3,
      update: 1,
      delete: 0,
      bulk: 2,
      other: 0,
    });
  });
});
