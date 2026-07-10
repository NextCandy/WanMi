import { Hono } from "hono";

import { normalizeDomain } from "../../../shared/domain";
import { offerInputSchema, publicDomainQuerySchema } from "../../../shared/schemas/api";
import type { PublicDomain } from "../../../shared/types/api";
import { fail, ok, writeOperationLog } from "../../http";
import { hmacSha256 } from "../../security/crypto";
import { requestIp } from "../../security/session";
import { sendNotification } from "../../services/notifications";
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
  buy_now_price: string | null;
  floor_price: string | null;
  min_offer: string | null;
  listing_status: string | null;
  views: number | null;
  date_added_at: string | null;
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
  show_prices: number;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  wechat_qr_url: string | null;
}

const PUBLIC_SELECT = `SELECT d.id, d.full_domain AS domain, d.name, d.tld, d.category, d.is_featured,
  CASE WHEN d.public_price_approved = 1 THEN d.public_price ELSE NULL END AS public_price,
  CASE WHEN d.public_price_approved = 1 THEN d.public_price_currency ELSE NULL END AS public_price_currency,
  m.buy_now_price, m.floor_price, m.min_offer, m.listing_status, m.views, m.date_added_at
  FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id`;

// 报价文本可能带 $ 与千分位，统一转 REAL 排序
const PRICE_SQL = `COALESCE(
  CASE WHEN d.public_price_approved = 1 THEN CAST(d.public_price AS REAL) END,
  CAST(replace(replace(COALESCE(m.buy_now_price, ''), '$', ''), ',', '') AS REAL)
)`;

function serializePublic(row: PublicDomainRow, showPrices: boolean): PublicDomain & Record<string, unknown> {
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    category: row.category,
    is_featured: row.is_featured === 1,
    is_market_listed: row.listing_status === "Listed",
    views: row.views,
    date_added_at: row.date_added_at,
    ...(showPrices
      ? { public_price: row.public_price, floor_price: row.floor_price, min_offer: row.min_offer }
      : {}),
  };
}

export const publicRoutes = new Hono<AppBindings>();

publicRoutes.get("/settings", async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT site_name, site_description, site_bio, logo_url, favicon_url, accent_color, display_density,
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
  const [tldResult, categoryResult, statsResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT DISTINCT tld FROM domains WHERE is_listed = 1 ORDER BY tld"),
    c.env.DB.prepare(
      "SELECT DISTINCT category FROM domains WHERE is_listed = 1 AND category IS NOT NULL AND category != '' ORDER BY category",
    ),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT d.tld) AS tld_count, MAX(m.date_added_at) AS latest_added
       FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id WHERE d.is_listed = 1`,
    ),
  ]);
  const stats = (statsResult.results[0] ?? {}) as { total?: number; tld_count?: number; latest_added?: string | null };
  return ok(c, {
    tlds: (tldResult.results as unknown as Array<{ tld: string }>).map((row) => row.tld),
    categories: (categoryResult.results as unknown as Array<{ category: string }>).map((row) => row.category),
    total: Number(stats.total ?? 0),
    tldCount: Number(stats.tld_count ?? 0),
    latestAddedAt: stats.latest_added ?? null,
  });
});

function publicFilters(query: ReturnType<typeof publicDomainQuerySchema.parse>): {
  where: string;
  params: Array<string | number>;
} {
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
  if (query.kind === "digits") where.push("d.name NOT GLOB '*[^0-9]*'");
  if (query.kind === "letters") where.push("d.name NOT GLOB '*[^a-z]*'");
  return { where: where.join(" AND "), params };
}

publicRoutes.get("/domains", async (c) => {
  const parsed = publicDomainQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "筛选参数无效", parsed.error.issues);
  const query = parsed.data;
  const { where, params } = publicFilters(query);
  const offset = (query.page - 1) * query.pageSize;
  const settings = await c.env.DB.prepare("SELECT featured_first, show_prices FROM site_settings WHERE id = 1").first<{
    featured_first: number;
    show_prices: number;
  }>();
  const defaultSort = `${settings?.featured_first === 1 ? "d.is_featured DESC," : ""} length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC`;
  const sortSql =
    query.sort === "domain_asc" ? "d.normalized_domain ASC"
    : query.sort === "domain_desc" ? "d.normalized_domain DESC"
    : query.sort === "price_desc" ? `${PRICE_SQL} IS NULL, ${PRICE_SQL} DESC, d.normalized_domain ASC`
    : query.sort === "price_asc" ? `${PRICE_SQL} IS NULL, ${PRICE_SQL} ASC, d.normalized_domain ASC`
    : query.sort === "views_desc" ? "m.views IS NULL, m.views DESC, d.normalized_domain ASC"
    : query.sort === "added_desc" ? "m.date_added_at IS NULL, m.date_added_at DESC, d.normalized_domain ASC"
    : query.sort === "length_asc" ? "length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC"
    : defaultSort;
  const [countResult, dataResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id WHERE ${where}`).bind(...params),
    c.env.DB.prepare(`${PUBLIC_SELECT} WHERE ${where} ORDER BY ${sortSql} LIMIT ? OFFSET ?`).bind(...params, query.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  const showPrices = settings?.show_prices === 1;
  return ok(c, {
    items: (dataResult.results as unknown as PublicDomainRow[]).map((row) => serializePublic(row, showPrices)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

publicRoutes.get("/domains/:name", async (c) => {
  const name = c.req.param("name").trim().toLowerCase();
  if (!name || name.length > 253) return fail(c, 422, "INVALID_DOMAIN", "域名无效");
  const settings = await c.env.DB.prepare("SELECT show_prices, site_name FROM site_settings WHERE id = 1").first<{
    show_prices: number;
    site_name: string;
  }>();
  const row = await c.env.DB.prepare(`${PUBLIC_SELECT} WHERE d.is_listed = 1 AND d.normalized_domain = ?`)
    .bind(name)
    .first<PublicDomainRow>();
  if (!row) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在或未上架");
  const related = await c.env.DB.prepare(
    `${PUBLIC_SELECT} WHERE d.is_listed = 1 AND d.id <> ?
      AND (d.tld = ? OR length(replace(d.name, '.', '')) = ?)
     ORDER BY d.is_featured DESC, (d.tld = ?) DESC, length(replace(d.name, '.', '')) ASC LIMIT 8`,
  )
    .bind(row.id, row.tld, row.name.length, row.tld)
    .all();
  const showPrices = settings?.show_prices === 1;
  return ok(c, {
    domain: serializePublic(row, showPrices),
    related: (related.results as unknown as PublicDomainRow[]).map((item) => serializePublic(item, showPrices)),
  });
});

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapEntity { roles?: string[]; vcardArray?: [string, Array<[string, unknown, string, unknown]>] }
interface RdapResponse {
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName?: string }>;
}

publicRoutes.get("/rdap/:name", async (c) => {
  const name = c.req.param("name").trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) return fail(c, 422, "INVALID_DOMAIN", "域名无效");
  let payload: RdapResponse;
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!response.ok) return fail(c, 502, "RDAP_UNAVAILABLE", `RDAP 查询失败（${response.status}）`);
    payload = (await response.json());
  } catch {
    return fail(c, 502, "RDAP_UNAVAILABLE", "RDAP 服务暂时不可用");
  }
  const events = payload.events ?? [];
  const eventDate = (action: string) => events.find((event) => event.eventAction === action)?.eventDate ?? null;
  const registrarEntity = (payload.entities ?? []).find((entity) => entity.roles?.includes("registrar"));
  const registrar = registrarEntity?.vcardArray?.[1]?.find((item) => item[0] === "fn")?.[3] ?? null;
  c.header("Cache-Control", "public, max-age=3600");
  return ok(c, {
    domain: name,
    registrar: typeof registrar === "string" ? registrar : null,
    createdAt: eventDate("registration"),
    expiresAt: eventDate("expiration"),
    updatedAt: eventDate("last changed"),
    status: payload.status ?? [],
    nameservers: (payload.nameservers ?? []).map((item) => item.ldhName?.toLowerCase()).filter(Boolean),
  });
});

publicRoutes.post("/offers", async (c) => {
  const parsed = offerInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_OFFER", "求购信息无效", parsed.error.issues);
  let normalized: string;
  try {
    normalized = normalizeDomain(parsed.data.domain).normalizedDomain;
  } catch {
    return fail(c, 422, "INVALID_OFFER", "域名无效");
  }
  const domain = await c.env.DB.prepare("SELECT id, full_domain FROM domains WHERE normalized_domain = ? AND is_listed = 1")
    .bind(normalized)
    .first<{ id: number; full_domain: string }>();
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在或未上架");
  const ipHash = await hmacSha256(requestIp(c), c.env.SESSION_SECRET);
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM domain_leads WHERE ip_hash = ? AND created_at >= datetime('now', '-1 hour')",
  )
    .bind(ipHash)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) return fail(c, 429, "OFFER_RATE_LIMITED", "提交过于频繁，请稍后再试");
  const country = c.req.header("cf-ipcountry") ?? null;
  await c.env.DB.prepare(
    `INSERT INTO domain_leads (domain_id, offer_amount, currency, contact, message, ip_hash, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      domain.id,
      parsed.data.amount ?? null,
      parsed.data.currency ?? null,
      parsed.data.contact,
      parsed.data.message ?? null,
      ipHash,
      country,
    )
    .run();
  await writeOperationLog(c.env.DB, {
    action: "leads.create",
    resourceType: "domain_lead",
    resourceId: domain.id,
    message: `收到 ${domain.full_domain} 的求购线索`,
    success: true,
  });
  // 尽力通知，不阻塞响应也不影响结果
  const notify = async () => {
    const settings = await c.env.DB.prepare(
      `SELECT email_enabled, telegram_enabled, bark_enabled, email_recipient, telegram_chat_id,
        bark_device_key_encrypted, bark_device_key_iv
       FROM notification_settings WHERE id = 1`,
    ).first<{
      email_enabled: number;
      telegram_enabled: number;
      bark_enabled: number;
      email_recipient: string | null;
      telegram_chat_id: string | null;
      bark_device_key_encrypted: string | null;
      bark_device_key_iv: string | null;
    }>();
    if (!settings) return;
    const message = {
      title: `WanMi 求购线索：${domain.full_domain}`,
      content: `联系方式：${parsed.data.contact}${parsed.data.amount ? `\n报价：${parsed.data.amount} ${parsed.data.currency ?? ""}` : ""}${parsed.data.message ? `\n留言：${parsed.data.message}` : ""}`,
    };
    const channels = [
      settings.email_enabled ? ("email" as const) : null,
      settings.telegram_enabled ? ("telegram" as const) : null,
      settings.bark_enabled ? ("bark" as const) : null,
    ].filter((channel): channel is "email" | "telegram" | "bark" => channel !== null);
    await Promise.allSettled(channels.map((channel) => sendNotification(c.env, channel, settings, message)));
  };
  c.executionCtx.waitUntil(notify());
  return ok(c, { received: true }, 201);
});

publicRoutes.get("/og/:name", async (c) => {
  const name = c.req.param("name").trim().toLowerCase().replace(/\.svg$/, "");
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) return fail(c, 422, "INVALID_DOMAIN", "域名无效");
  const settings = await c.env.DB.prepare("SELECT site_name, accent_color FROM site_settings WHERE id = 1").first<{
    site_name: string;
    accent_color: string;
  }>();
  const accent = /^#[0-9a-f]{6}$/i.test(settings?.accent_color ?? "") ? settings!.accent_color : "#f97316";
  const site = (settings?.site_name ?? "WanMi").replace(/[<>&"]/g, "");
  const safeName = name.replace(/[<>&"]/g, "");
  const fontSize = safeName.length > 24 ? 56 : safeName.length > 14 ? 76 : 96;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c1917"/><stop offset="1" stop-color="#292019"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.9">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="80" y="88" width="72" height="72" rx="18" fill="${accent}"/>
  <text x="116" y="139" font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#ffffff" text-anchor="middle">W</text>
  <text x="176" y="138" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#ffffff">${site}</text>
  <text x="600" y="360" font-family="'Courier New', monospace" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${safeName}</text>
  <text x="600" y="430" font-family="Arial, sans-serif" font-size="26" fill="${accent}" text-anchor="middle">This domain is for sale · 域名出售中</text>
  <rect x="80" y="536" width="1040" height="2" fill="${accent}" opacity="0.45"/>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
