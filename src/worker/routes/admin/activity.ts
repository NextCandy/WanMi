import { Hono } from "hono";

import { fail, ok } from "../../http";
import type { AppBindings } from "../../types";

export const activityRoutes = new Hono<AppBindings>();

activityRoutes.get("/logs", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) return fail(c, 422, "INVALID_QUERY", "分页参数无效");
  const action = c.req.query("action");
  const where = action ? "WHERE action = ?" : "";
  const params = action ? [action] : [];
  const [count, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM operation_logs ${where}`).bind(...params),
    c.env.DB.prepare(`SELECT * FROM operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...params, pageSize, (page - 1) * pageSize),
  ]);
  const total = Number((count.results[0] as { total?: number } | undefined)?.total ?? 0);
  return ok(c, { items: rows.results, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});

activityRoutes.get("/sync-runs", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100").all();
  return ok(c, result.results);
});
