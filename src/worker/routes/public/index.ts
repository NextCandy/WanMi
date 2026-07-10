import { Hono } from "hono";

import { publicDomainQuerySchema } from "../../../shared/schemas/api";
import type { PublicDomain } from "../../../shared/types/api";
import { fail, ok } from "../../http";
import type { AppBindings } from "../../types";

interface PublicDomainRow {
  id: number;
  domain: string;
  name: string;
  tld: string;
  category: string | null;
  is_featured: number;
  public_price: string | null;
  public_price_currency: string | null;
}

interface SettingsRow {
  site_name: string;
  site_description: string;
  logo_url: string | null;
  favicon_url: string | null;
  accent_color: string;
  display_density: string;
  featured_first: number;
  show_prices: number;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  wechat_qr_url: string | null;
}

export const publicRoutes = new Hono<AppBindings>();

publicRoutes.get("/settings", async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT site_name, site_description, logo_url, favicon_url, accent_color, display_density,
      featured_first, show_prices, copyright_text, icp_number, contact_email, contact_wechat,
      contact_telegram, wechat_qr_url
     FROM site_settings WHERE id = 1`,
  ).first<SettingsRow>();
  if (!settings) return fail(c, 503, "SETTINGS_UNAVAILABLE", "站点设置尚未初始化");
  return ok(c, {
    ...settings,
    featured_first: settings.featured_first === 1,
    show_prices: settings.show_prices === 1,
  });
});

publicRoutes.get("/facets", async (c) => {
  const [tldResult, categoryResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT DISTINCT tld FROM domains WHERE is_listed = 1 ORDER BY tld"),
    c.env.DB.prepare(
      "SELECT DISTINCT category FROM domains WHERE is_listed = 1 AND category IS NOT NULL AND category != '' ORDER BY category",
    ),
  ]);
  return ok(c, {
    tlds: (tldResult.results as unknown as Array<{ tld: string }>).map((row) => row.tld),
    categories: (categoryResult.results as unknown as Array<{ category: string }>).map((row) => row.category),
  });
});

publicRoutes.get("/domains", async (c) => {
  const parsed = publicDomainQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "筛选参数无效", parsed.error.issues);
  const query = parsed.data;
  const where = ["d.is_listed = 1"];
  const params: Array<string | number> = [];
  if (query.q) {
    where.push("d.normalized_domain LIKE ? ESCAPE '\\'");
    params.push(`%${query.q.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }
  if (query.tld) {
    where.push("d.tld = ?");
    params.push(query.tld.toLowerCase().replace(/^\./, ""));
  }
  if (query.length) {
    where.push("length(replace(d.name, '.', '')) = ?");
    params.push(query.length);
  }
  if (query.category) {
    where.push("d.category = ?");
    params.push(query.category);
  }
  if (query.featured) {
    where.push("d.is_featured = ?");
    params.push(query.featured === "true" ? 1 : 0);
  }
  const whereSql = where.join(" AND ");
  const offset = (query.page - 1) * query.pageSize;
  const settings = await c.env.DB.prepare("SELECT featured_first, show_prices FROM site_settings WHERE id = 1").first<{
    featured_first: number;
    show_prices: number;
  }>();
  const sortSql =
    query.sort === "domain_asc"
      ? "d.normalized_domain ASC"
      : query.sort === "domain_desc"
        ? "d.normalized_domain DESC"
        : `${settings?.featured_first === 1 ? "d.is_featured DESC," : ""} length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC`;
  const [countResult, dataResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM domains d WHERE ${whereSql}`).bind(...params),
    c.env.DB.prepare(
      `SELECT d.id, d.full_domain AS domain, d.name, d.tld, d.category, d.is_featured,
        CASE WHEN d.public_price_approved = 1 THEN d.public_price ELSE NULL END AS public_price,
        CASE WHEN d.public_price_approved = 1 THEN d.public_price_currency ELSE NULL END AS public_price_currency
       FROM domains d WHERE ${whereSql}
       ORDER BY ${sortSql} LIMIT ? OFFSET ?`,
    ).bind(...params, query.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  const showPrices = settings?.show_prices === 1;
  const items = (dataResult.results as unknown as PublicDomainRow[]).map((row): PublicDomain => ({
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    category: row.category,
    is_featured: row.is_featured === 1,
    ...(showPrices ? { public_price: row.public_price } : {}),
  }));
  return ok(c, {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

publicRoutes.get("/domains/:domain", async (c) => {
  const domain = c.req.param("domain").trim().toLowerCase();
  const settings = await c.env.DB.prepare("SELECT show_prices FROM site_settings WHERE id = 1").first<{ show_prices: number }>();
  const row = await c.env.DB.prepare(
    `SELECT id, full_domain AS domain, name, tld, category, is_featured,
      CASE WHEN public_price_approved = 1 THEN public_price ELSE NULL END AS public_price,
      CASE WHEN public_price_approved = 1 THEN public_price_currency ELSE NULL END AS public_price_currency
     FROM domains WHERE normalized_domain = ? AND is_listed = 1`,
  )
    .bind(domain)
    .first<PublicDomainRow>();
  if (!row) return fail(c, 404, "DOMAIN_NOT_FOUND", "未找到该域名");
  return ok(c, {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    category: row.category,
    is_featured: row.is_featured === 1,
    ...(settings?.show_prices === 1
      ? { public_price: row.public_price, public_price_currency: row.public_price_currency }
      : {}),
  });
});
