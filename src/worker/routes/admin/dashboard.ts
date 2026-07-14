import { Hono } from "hono";

import { ok } from "../../http";
import type { AppBindings } from "../../types";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get("/", async (c) => {
  const [counts, tlds, recentLogs, expirations, expiring] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_listed = 1 THEN 1 ELSE 0 END) AS listed,
      SUM(CASE WHEN is_listed = 0 THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) AS featured
      FROM domains`),
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare(`SELECT id, level, action, resource_type, resource_id, message, success, created_at
      FROM operation_logs ORDER BY created_at DESC LIMIT 10`),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM domains WHERE expires_at IS NOT NULL"),
    c.env.DB.prepare(
      `SELECT full_domain, expires_at FROM domains
       WHERE expires_at IS NOT NULL AND expires_at <= datetime('now', '+90 days')
       ORDER BY expires_at ASC LIMIT 10`,
    ),
  ]);
  return ok(c, {
    expiring90d: expiring.results,
    counts: counts.results[0] ?? { total: 0, listed: 0, hidden: 0, featured: 0 },
    tlds: tlds.results,
    recentLogs: recentLogs.results,
    hasExpirationData: Number((expirations.results[0] as { count?: number } | undefined)?.count ?? 0) > 0,
  });
});
