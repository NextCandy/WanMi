import { Hono } from "hono";

import { ok } from "../../http";
import type { AppBindings } from "../../types";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get("/", async (c) => {
  const [counts, tlds, recentLogs, expirations, expiring, notificationHealth, todayStats, sevenDays, topDomains, countries, expiringSoon, expiringTrend, categorySpread] = await c.env.DB.batch([
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
    c.env.DB.prepare("SELECT channel, enabled, last_test FROM notify_channels ORDER BY channel"),
    c.env.DB.prepare("SELECT SUM(CASE WHEN kind = 'page_view' THEN 1 ELSE 0 END) AS pv, COUNT(DISTINCT CASE WHEN kind = 'page_view' THEN visitor_id END) AS uv FROM stats_events WHERE ts >= unixepoch('now', 'start of day')"),
    c.env.DB.prepare("SELECT date(ts, 'unixepoch') AS day, SUM(CASE WHEN kind = 'page_view' THEN 1 ELSE 0 END) AS pv, COUNT(DISTINCT CASE WHEN kind = 'page_view' THEN visitor_id END) AS uv FROM stats_events WHERE ts >= unixepoch('now', '-6 days', 'start of day') GROUP BY day ORDER BY day"),
    c.env.DB.prepare("SELECT domain, COUNT(*) AS clicks, MAX(ts) AS latest FROM stats_events WHERE kind = 'domain_click' AND domain IS NOT NULL GROUP BY domain ORDER BY clicks DESC, latest DESC LIMIT 10"),
    c.env.DB.prepare("SELECT COALESCE(country, '未知') AS country, COUNT(DISTINCT visitor_id) AS visitors FROM stats_events WHERE ts >= unixepoch('now', '-30 days') GROUP BY country ORDER BY visitors DESC LIMIT 5"),
    // 概览统计卡「即将到期」：90 天内到期总数（expiring90d 列表只取前 10 条，不能拿来当计数）
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM domains WHERE expires_at IS NOT NULL AND date(expires_at) >= date('now') AND expires_at <= datetime('now', '+90 days')"),
    // 到期趋势：未来 6 个月按月聚合（含已过期归入当月之前的不计入）
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', expires_at) AS month, COUNT(*) AS count FROM domains
       WHERE expires_at IS NOT NULL AND date(expires_at) >= date('now') AND expires_at < datetime('now', '+6 months')
       GROUP BY month ORDER BY month`,
    ),
    // 分类分布：人工分类优先，其余按自动分类标签聚合
    c.env.DB.prepare(
      `SELECT category, COUNT(*) AS count FROM (
         SELECT NULLIF(category, '') AS category FROM domains WHERE NULLIF(category, '') IS NOT NULL
         UNION ALL
         SELECT dac.category FROM domain_auto_categories dac
         JOIN domains d ON d.id = dac.domain_id WHERE NULLIF(d.category, '') IS NULL
       ) WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 12`,
    ),
  ]);
  return ok(c, {
    expiring90d: expiring.results,
    counts: counts.results[0] ?? { total: 0, listed: 0, hidden: 0, featured: 0 },
    expiringSoonCount: Number((expiringSoon.results[0] as { count?: number } | undefined)?.count ?? 0),
    expiringTrend: expiringTrend.results,
    categorySpread: categorySpread.results,
    tlds: tlds.results,
    recentLogs: recentLogs.results,
    hasExpirationData: Number((expirations.results[0] as { count?: number } | undefined)?.count ?? 0) > 0,
    notificationHealth: notificationHealth.results,
    stats: {
      today: todayStats.results[0] ?? { pv: 0, uv: 0 },
      sevenDays: sevenDays.results,
      topDomains: topDomains.results,
      countries: countries.results,
    },
  });
});
