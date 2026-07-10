import { Hono } from "hono";

import { ok } from "../../http";
import type { AppBindings } from "../../types";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get("/", async (c) => {
  const priceSql = "CAST(replace(replace(COALESCE(m.buy_now_price, d.public_price, ''), '$', ''), ',', '') AS REAL)";
  const [counts, tlds, statuses, recentImports, recentSyncs, recentLogs, registrars, expirations, market, topViews, leads, expiring] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_listed = 1 THEN 1 ELSE 0 END) AS listed,
      SUM(CASE WHEN is_listed = 0 THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) AS featured
      FROM domains`),
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare(`SELECT COALESCE(listing_status, '(空)') AS status, COUNT(*) AS count
      FROM domain_marketplace_listings GROUP BY listing_status ORDER BY count DESC`),
    c.env.DB.prepare("SELECT * FROM sync_runs WHERE source = 'csv' ORDER BY started_at DESC LIMIT 5"),
    c.env.DB.prepare("SELECT * FROM sync_runs WHERE source <> 'csv' ORDER BY started_at DESC LIMIT 5"),
    c.env.DB.prepare(`SELECT id, level, action, resource_type, resource_id, message, success, created_at
      FROM operation_logs ORDER BY created_at DESC LIMIT 10`),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM registrar_accounts"),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM domains WHERE expires_at IS NOT NULL"),
    c.env.DB.prepare(
      `SELECT SUM(${priceSql}) AS total_value, AVG(NULLIF(${priceSql}, 0)) AS avg_price,
        SUM(COALESCE(m.views, 0)) AS total_views, SUM(COALESCE(m.leads, 0)) AS market_leads
       FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id`,
    ),
    c.env.DB.prepare(
      `SELECT d.full_domain, m.views FROM domains d JOIN domain_marketplace_listings m ON m.domain_id = d.id
       WHERE m.views IS NOT NULL ORDER BY m.views DESC LIMIT 5`,
    ),
    c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh FROM domain_leads"),
    c.env.DB.prepare(
      `SELECT full_domain, expires_at FROM domains
       WHERE expires_at IS NOT NULL AND expires_at <= datetime('now', '+90 days')
       ORDER BY expires_at ASC LIMIT 10`,
    ),
  ]);
  const marketRow = (market.results[0] ?? {}) as { total_value?: number; avg_price?: number; total_views?: number; market_leads?: number };
  const leadsRow = (leads.results[0] ?? {}) as { total?: number; fresh?: number };
  return ok(c, {
    kpis: {
      totalValue: Math.round(Number(marketRow.total_value ?? 0)),
      avgPrice: Math.round(Number(marketRow.avg_price ?? 0)),
      totalViews: Number(marketRow.total_views ?? 0),
      marketLeads: Number(marketRow.market_leads ?? 0),
      siteLeads: Number(leadsRow.total ?? 0),
      newSiteLeads: Number(leadsRow.fresh ?? 0),
    },
    topViews: topViews.results,
    expiring90d: expiring.results,
    counts: counts.results[0] ?? { total: 0, listed: 0, hidden: 0, featured: 0 },
    tlds: tlds.results,
    listingStatuses: statuses.results,
    recentImports: recentImports.results,
    recentSyncs: recentSyncs.results,
    recentLogs: recentLogs.results,
    registrarCount: Number((registrars.results[0] as { count?: number } | undefined)?.count ?? 0),
    hasExpirationData: Number((expirations.results[0] as { count?: number } | undefined)?.count ?? 0) > 0,
  });
});
