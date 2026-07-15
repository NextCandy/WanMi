import { Hono } from "hono";

import { ok } from "../../http";
import type { AppBindings } from "../../types";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get("/", async (c) => {
  const [counts, tlds, recentLogs, expirations, expiring, notificationHealth, todayStats, sevenDays, topDomains, countries, lengths, categories, expiryBuckets] = await c.env.DB.batch([
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
    // 字符长度分布（域名主体去掉点后的长度），8 位及以上合并
    c.env.DB.prepare("SELECT MIN(length(replace(name, '.', '')), 8) AS len, COUNT(*) AS count FROM domains GROUP BY len ORDER BY len ASC"),
    // 分类分布：与前台同口径（人工分类优先，否则多标签自动分类）
    c.env.DB.prepare(
      `SELECT name, COUNT(*) AS count FROM (
         SELECT NULLIF(d.category, '') AS name FROM domains d WHERE NULLIF(d.category, '') IS NOT NULL
         UNION ALL
         SELECT dac.category FROM domain_auto_categories dac JOIN domains d ON d.id = dac.domain_id WHERE NULLIF(d.category, '') IS NULL
       ) effective WHERE name IS NOT NULL GROUP BY name ORDER BY count DESC LIMIT 10`,
    ),
    // 到期分桶：已过期 / 30 天内 / 31-60 / 61-90 / 90 天以上
    c.env.DB.prepare(
      `SELECT
        SUM(CASE WHEN date(expires_at) < date('now') THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN date(expires_at) >= date('now') AND date(expires_at) <= date('now', '+30 days') THEN 1 ELSE 0 END) AS d30,
        SUM(CASE WHEN date(expires_at) > date('now', '+30 days') AND date(expires_at) <= date('now', '+60 days') THEN 1 ELSE 0 END) AS d60,
        SUM(CASE WHEN date(expires_at) > date('now', '+60 days') AND date(expires_at) <= date('now', '+90 days') THEN 1 ELSE 0 END) AS d90,
        SUM(CASE WHEN date(expires_at) > date('now', '+90 days') THEN 1 ELSE 0 END) AS d90plus
       FROM domains WHERE expires_at IS NOT NULL`,
    ),
  ]);
  return ok(c, {
    expiring90d: expiring.results,
    counts: counts.results[0] ?? { total: 0, listed: 0, hidden: 0, featured: 0 },
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
    lengths: lengths.results,
    categories: categories.results,
    expiryBuckets: expiryBuckets.results[0] ?? { expired: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 },
  });
});
