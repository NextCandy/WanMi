import { Hono } from "hono";

import { logsQuerySchema } from "../../../shared/schemas/api";
import { fail, ok } from "../../http";
import type { AppBindings } from "../../types";

function logFilters(query: ReturnType<typeof logsQuerySchema.parse>): { where: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (query.level) {
    clauses.push("level = ?");
    params.push(query.level);
  }
  if (query.action) {
    clauses.push("action = ?");
    params.push(query.action);
  }
  if (query.q) {
    clauses.push("(message LIKE ? OR action LIKE ?)");
    const like = `%${query.q.replaceAll("%", "\\%")}%`;
    params.push(like, like);
  }
  if (query.from) {
    clauses.push("created_at >= ?");
    params.push(`${query.from} 00:00:00`);
  }
  if (query.to) {
    clauses.push("created_at <= ?");
    params.push(`${query.to} 23:59:59`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export const activityRoutes = new Hono<AppBindings>();

activityRoutes.get("/logs", async (c) => {
  const parsed = logsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "日志筛选参数无效", parsed.error.issues);
  const query = parsed.data;
  const { where, params } = logFilters(query);
  const [count, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM operation_logs ${where}`).bind(...params),
    c.env.DB.prepare(`SELECT * FROM operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(
      ...params,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ),
  ]);
  const total = Number((count.results[0] as { total?: number } | undefined)?.total ?? 0);
  return ok(c, { items: rows.results, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) });
});

activityRoutes.get("/logs/export", async (c) => {
  const parsed = logsQuerySchema.safeParse({ ...c.req.query(), page: 1, pageSize: 200 });
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "日志筛选参数无效");
  const { where, params } = logFilters(parsed.data);
  const rows = await c.env.DB.prepare(
    `SELECT created_at, level, action, resource_type, resource_id, message, success FROM operation_logs ${where}
     ORDER BY created_at DESC LIMIT 5000`,
  )
    .bind(...params)
    .all();
  const cell = (value: unknown) => {
    const text = value === null || value === undefined
      ? ""
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    "Time,Level,Action,Resource Type,Resource ID,Message,Success",
    ...rows.results.map((row) =>
      [row.created_at, row.level, row.action, row.resource_type, row.resource_id, row.message, row.success].map(cell).join(","),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="WanMi-logs-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

activityRoutes.get("/sync-runs", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100").all();
  return ok(c, result.results);
});
