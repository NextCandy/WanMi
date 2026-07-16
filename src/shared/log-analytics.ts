export type LogActionGroup = "create" | "update" | "delete" | "bulk" | "other";

export const LOG_GROUP_LABELS: Record<LogActionGroup, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  bulk: "批量",
  other: "其他",
};

/**
 * 把日志 action 归入统计分组。
 * 批量必须先判断：domains.bulk.delete 属于批量操作，否则会被 delete 规则截胡。
 */
export function groupLogAction(action: string): LogActionGroup {
  if (action.includes(".bulk.")) return "bulk";
  if (action.endsWith(".create")) return "create";
  if (action.endsWith(".update")) return "update";
  if (action.endsWith(".delete")) return "delete";
  return "other";
}

export interface LogTrendRow {
  day: string;
  action: string;
  count: number;
}

export interface LogTrendPoint extends Record<LogActionGroup, number> {
  day: string;
  label: string;
  total: number;
}

function shiftDay(endDay: string, offset: number): string {
  const date = new Date(`${endDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/**
 * 补齐连续的每一天，没有日志的那天补 0。
 * 不补齐的话折线图会直接跳过空白日期，把"那天没有操作"画成"那天不存在"。
 */
export function buildLogTrend(rows: LogTrendRow[], endDay: string, days = 7): LogTrendPoint[] {
  const buckets = new Map<string, LogTrendPoint>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDay(endDay, offset);
    buckets.set(day, { day, label: day.slice(5), total: 0, create: 0, update: 0, delete: 0, bulk: 0, other: 0 });
  }
  for (const row of rows) {
    const point = buckets.get(row.day);
    if (!point) continue;
    point[groupLogAction(row.action)] += row.count;
    point.total += row.count;
  }
  return [...buckets.values()];
}

export function summarizeLogGroups(points: LogTrendPoint[]): Record<LogActionGroup, number> {
  const totals: Record<LogActionGroup, number> = { create: 0, update: 0, delete: 0, bulk: 0, other: 0 };
  for (const point of points) {
    for (const group of Object.keys(totals) as LogActionGroup[]) totals[group] += point[group];
  }
  return totals;
}
