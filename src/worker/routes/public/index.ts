import { Hono } from "hono";

import { AUTO_CATEGORY_ORDER } from "../../../shared/auto-classify";
import { publicDomainQuerySchema } from "../../../shared/schemas/api";
import type { PublicDomain } from "../../../shared/types/api";
import { fail, ok } from "../../http";
import { PUBLIC_CACHE_CONTROL } from "../../middleware/edge-cache";
import { publicDefaultOrderSql } from "../../services/public-domain-order";
import type { AppBindings } from "../../types";
import { renderFeaturedDomainOg } from "./og";

interface PublicDomainRow {
  id: number;
  domain: string;
  name: string;
  tld: string;
  description: string;
  category: string | null;
  manual_category: string | null;
  auto_categories: string | null;
  is_featured: number;
  registrar_name: string | null;
  registered_at: string | null;
  expires_at: string | null;
}

interface SettingsRow {
  site_name: string;
  site_description: string;
  site_bio: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  accent_color: string;
  display_density: string;
  featured_first: number;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  wechat_qr_url: string | null;
  show_admin_link_in_footer: number;
  contact_whatsapp: string | null;
  contact_x: string | null;
  contact_xiaohongshu: string | null;
  contact_qq: string | null;
}

const PUBLIC_SELECT = `SELECT d.id, d.full_domain AS domain, d.name, d.tld, d.description,
  NULLIF(d.category, '') AS manual_category,
  COALESCE(NULLIF(d.category, ''), d.auto_category) AS category,
  (SELECT GROUP_CONCAT(dac.category, '|') FROM domain_auto_categories dac WHERE dac.domain_id = d.id) AS auto_categories,
  d.is_featured, d.registrar_name, d.registered_at, d.expires_at FROM domains d`;

function serializePublic(row: PublicDomainRow): PublicDomain & Record<string, unknown> {
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    description: row.description,
    category: row.category,
    categories: row.manual_category
      ? [row.manual_category]
      : (row.auto_categories?.split("|").filter(Boolean) ?? (row.category ? [row.category] : [])),
    is_featured: row.is_featured === 1,
    registrar_name: row.registrar_name,
    registered_at: row.registered_at,
    expires_at: row.expires_at,
  };
}

export const publicRoutes = new Hono<AppBindings>();

publicRoutes.get("/og/:domain", renderFeaturedDomainOg);

publicRoutes.get("/settings", async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT site_name, site_description, site_bio, logo_url, favicon_url, accent_color, display_density,
      featured_first, copyright_text, icp_number, contact_email, contact_wechat,
      contact_telegram, contact_whatsapp, contact_x, contact_xiaohongshu, contact_qq,
      wechat_qr_url, show_admin_link_in_footer
     FROM site_settings WHERE id = 1`,
  ).first<SettingsRow>();
  if (!settings) return fail(c, 503, "SETTINGS_UNAVAILABLE", "站点设置尚未初始化");
  c.header("Cache-Control", "no-store");
  return ok(c, {
    ...settings,
    featured_first: settings.featured_first === 1,
    show_admin_link_in_footer: settings.show_admin_link_in_footer === 1,
  });
});

publicRoutes.get("/facets", async (c) => {
  const [tldResult, categoryResult, statsResult, featuredResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains WHERE is_listed = 1 GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare(
      `SELECT category, COUNT(*) AS count FROM (
         SELECT NULLIF(d.category, '') AS category
         FROM domains d
         WHERE d.is_listed = 1 AND NULLIF(d.category, '') IS NOT NULL
         UNION ALL
         SELECT dac.category
         FROM domain_auto_categories dac
         JOIN domains d ON d.id = dac.domain_id
         WHERE d.is_listed = 1 AND NULLIF(d.category, '') IS NULL
       ) effective_categories
       WHERE category IS NOT NULL
       GROUP BY category`,
    ),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS total, COUNT(DISTINCT tld) AS tld_count, SUM(is_featured) AS featured_count, MAX(updated_at) AS latest_added FROM domains WHERE is_listed = 1",
    ),
    c.env.DB.prepare(
      `${PUBLIC_SELECT} WHERE d.is_listed = 1 AND d.is_featured = 1
       ORDER BY d.updated_at DESC, d.normalized_domain ASC LIMIT 9`,
    ),
  ]);
  const stats = (statsResult.results[0] ?? {}) as { total?: number; tld_count?: number; featured_count?: number; latest_added?: string | null };
  const categoryOrder = new Map<string, number>(AUTO_CATEGORY_ORDER.map((name, index) => [name, index]));
  const categoryRows = (categoryResult.results as unknown as Array<{ category: string; count: number }>).sort((a, b) =>
    (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER)
      || a.category.localeCompare(b.category, "zh-CN"),
  );
  const totalDomains = Number(stats.total ?? 0);
  const totalTlds = Number(stats.tld_count ?? 0);
  const totalFeatured = Number(stats.featured_count ?? 0);
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL);
  return ok(c, {
    tlds: (tldResult.results as unknown as Array<{ tld: string }>).map((row) => row.tld),
    categories: categoryRows.map((row) => row.category),
    categoryCounts: Object.fromEntries(categoryRows.map((row) => [row.category, Number(row.count)])),
    total_domains: totalDomains,
    total_tlds: totalTlds,
    total_featured: totalFeatured,
    featured_domains: (featuredResult.results as unknown as PublicDomainRow[]).map(serializePublic),
    total: totalDomains,
    tldCount: totalTlds,
    featuredCount: totalFeatured,
    latestAddedAt: stats.latest_added ?? null,
  });
});

function publicFilters(query: ReturnType<typeof publicDomainQuerySchema.parse>): {
  where: string;
  params: Array<string | number>;
} {
  const where = ["d.is_listed = 1"];
  const params: Array<string | number> = [];
  const nameLength = "length(replace(d.name, '.', ''))";
  if (query.q) {
    where.push("d.normalized_domain LIKE ? ESCAPE '\\'");
    params.push(`%${query.q.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }
  if (query.tld) {
    where.push("d.tld = ?");
    params.push(query.tld.toLowerCase().replace(/^\./, ""));
  }
  if (query.length) {
    where.push(`${nameLength} = ?`);
    params.push(query.length);
  }
  if (query.minLength) {
    where.push(`${nameLength} >= ?`);
    params.push(query.minLength);
  }
  if (query.maxLength) {
    where.push(`${nameLength} <= ?`);
    params.push(query.maxLength);
  }
  if (query.contains) {
    where.push("instr(lower(d.name), ?) > 0");
    params.push(query.contains.toLowerCase());
  }
  if (query.excludes) {
    const excludedCharacters = [...new Set(Array.from(query.excludes.toLowerCase()))];
    for (const character of excludedCharacters) {
      where.push("instr(lower(d.name), ?) = 0");
      params.push(character);
    }
  }
  if (query.category) {
    where.push(`(
      NULLIF(d.category, '') = ?
      OR (
        NULLIF(d.category, '') IS NULL
        AND EXISTS (
          SELECT 1 FROM domain_auto_categories dac
          WHERE dac.domain_id = d.id AND dac.category = ?
        )
      )
    )`);
    params.push(query.category, query.category);
  }
  if (query.featured) {
    where.push("d.is_featured = ?");
    params.push(query.featured === "true" ? 1 : 0);
  }
  if (query.expiry === "7d") {
    where.push("d.expires_at IS NOT NULL AND date(d.expires_at) >= date('now') AND date(d.expires_at) <= date('now', '+7 days')");
  } else if (query.expiry === "30d") {
    where.push("d.expires_at IS NOT NULL AND date(d.expires_at) >= date('now') AND date(d.expires_at) <= date('now', '+30 days')");
  } else if (query.expiry === "expired") {
    where.push("d.expires_at IS NOT NULL AND date(d.expires_at) < date('now')");
  }
  if (query.kind === "digits") where.push("d.name != '' AND d.name NOT GLOB '*[^0-9]*'");
  if (query.kind === "letters") where.push("d.name != '' AND d.name NOT GLOB '*[^a-z]*'");
  if (query.kind === "alphanumeric") {
    where.push("d.name NOT GLOB '*[^a-z0-9]*' AND d.name GLOB '*[a-z]*' AND d.name GLOB '*[0-9]*'");
  }
  if (query.kind === "hyphen") where.push("instr(d.name, '-') > 0");
  return { where: where.join(" AND "), params };
}

publicRoutes.get("/domains", async (c) => {
  const parsed = publicDomainQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "筛选参数无效", parsed.error.issues);
  const query = parsed.data;
  if (query.minLength && query.maxLength && query.minLength > query.maxLength) {
    return fail(c, 422, "INVALID_QUERY", "最小长度不能大于最大长度");
  }
  const { where, params } = publicFilters(query);
  const offset = (query.page - 1) * query.pageSize;
  const sortSql =
    query.sort === "added_desc" ? "d.created_at DESC, d.normalized_domain ASC"
    : query.sort === "length_asc" ? "length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC"
    : query.sort === "length_desc" ? "length(replace(d.name, '.', '')) DESC, d.normalized_domain ASC"
    : query.sort === "tld_asc" ? "d.tld ASC, d.normalized_domain ASC"
    : query.sort === "random" ? "RANDOM()"
    : query.sort === "domain_asc" ? "d.normalized_domain ASC"
    : query.sort === "domain_desc" ? "d.normalized_domain DESC"
    : publicDefaultOrderSql("d");
  const [countResult, dataResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM domains d WHERE ${where}`).bind(...params),
    c.env.DB.prepare(`${PUBLIC_SELECT} WHERE ${where} ORDER BY ${sortSql} LIMIT ? OFFSET ?`).bind(...params, query.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  c.header("Cache-Control", query.sort === "random" ? "no-store" : PUBLIC_CACHE_CONTROL);
  return ok(c, {
    items: (dataResult.results as unknown as PublicDomainRow[]).map(serializePublic),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

publicRoutes.get("/version", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT version, updated_at FROM public_data_version WHERE id = 1",
  ).first<{ version: number; updated_at: string | null }>();
  c.header("Cache-Control", "no-store");
  return ok(c, { version: `${Number(row?.version ?? 0)}:${row?.updated_at ?? ""}` });
});
