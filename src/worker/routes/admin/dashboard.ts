import { Hono } from "hono";

import { ok } from "../../http";
import type { AppBindings } from "../../types";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get("/", async (c) => {
  const [counts, tlds, recentLogs, registrars, expirations, leads, expiring] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_listed = 1 THEN 1 ELSE 0 END) AS listed,
      SUM(CASE WHEN is_listed = 0 THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) AS featured
      FROM domains`),
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare(`SELECT id, level, action, resource_type, resource_id, message, success, created_at
      FROM operation_logs ORDER BY created_at DESC LIMIT 10`),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM registrar_accounts"),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM domains WHERE expires_at IS NOT NULL"),
    c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh FROM domain_leads"),
    c.env.DB.prepare(
      `SELECT full_domain, expires_at FROM domains
       WHERE expires_at IS NOT NULL AND expires_at <= datetime('now', '+90 days')
       ORDER BY expires_at ASC LIMIT 10`,
    ),
  ]);
  const leadsRow = (leads.results[0] ?? {}) as { total?: number; fresh?: number };
  return ok(c, {
    kpis: { siteLeads: Number(leadsRow.total ?? 0), newSiteLeads: Number(leadsRow.fresh ?? 0) },
    expiring90d: expiring.results,
    counts: counts.results[0] ?? { total: 0, listed: 0, hidden: 0, featured: 0 },
    tlds: tlds.results,
    recentLogs: recentLogs.results,
    registrarCount: Number((registrars.results[0] as { count?: number } | undefined)?.count ?? 0),
    hasExpirationData: Number((expirations.results[0] as { count?: number } | undefined)?.count ?? 0) > 0,
  });
});
