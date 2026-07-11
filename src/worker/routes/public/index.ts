import { Hono } from "hono";

import { normalizeDomain } from "../../../shared/domain";
import { offerInputSchema, publicDomainQuerySchema } from "../../../shared/schemas/api";
import type { PublicDomain } from "../../../shared/types/api";
import { fail, ok, writeOperationLog } from "../../http";
import { hmacSha256 } from "../../security/crypto";
import { requestIp } from "../../security/session";
import { enabledChannels, sendNotification, type NotificationSettingsRow } from "../../services/notifications";
import type { AppBindings } from "../../types";

interface PublicDomainRow {
  id: number;
  domain: string;
  name: string;
  tld: string;
  category: string | null;
  is_featured: number;
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
}

const PUBLIC_SELECT = `SELECT d.id, d.full_domain AS domain, d.name, d.tld, d.category, d.is_featured
  FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id`;

function serializePublic(row: PublicDomainRow): PublicDomain & Record<string, unknown> {
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    category: row.category,
    is_featured: row.is_featured === 1,
  };
}

export const publicRoutes = new Hono<AppBindings>();

publicRoutes.get("/settings", async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT site_name, site_description, site_bio, logo_url, favicon_url, accent_color, display_density,
      featured_first, copyright_text, icp_number, contact_email, contact_wechat,
      contact_telegram, wechat_qr_url
     FROM site_settings WHERE id = 1`,
  ).first<SettingsRow>();
  if (!settings) return fail(c, 503, "SETTINGS_UNAVAILABLE", "站点设置尚未初始化");
  return ok(c, {
    ...settings,
    featured_first: settings.featured_first === 1,
  });
});

publicRoutes.get("/facets", async (c) => {
  const [tldResult, categoryResult, statsResult] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT DISTINCT tld FROM domains WHERE is_listed = 1 ORDER BY tld"),
    c.env.DB.prepare(
      `SELECT category, MIN(sort_order) AS sort_order FROM (
         SELECT d.category AS category, 100 AS sort_order FROM domains d
         WHERE d.is_listed = 1 AND d.category IS NOT NULL AND d.category != ''
         UNION ALL
         SELECT ac.category,
           CASE ac.category WHEN '纯字母' THEN 1 WHEN '纯数字' THEN 2 WHEN '单拼' THEN 3 WHEN '双拼' THEN 4
             WHEN '三拼' THEN 5 WHEN '三数字' THEN 6 WHEN '四数字' THEN 7 WHEN '五数字' THEN 8 WHEN '六数字' THEN 9 ELSE 99 END
         FROM domain_auto_categories ac JOIN domains d ON d.id = ac.domain_id WHERE d.is_listed = 1
       ) GROUP BY category ORDER BY sort_order, category`,
    ),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS total, COUNT(DISTINCT tld) AS tld_count, MAX(updated_at) AS latest_added FROM domains WHERE is_listed = 1",
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
    where.push("(d.category = ? OR EXISTS (SELECT 1 FROM domain_auto_categories ac WHERE ac.domain_id = d.id AND ac.category = ?))");
    params.push(query.category, query.category);
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
  const settings = await c.env.DB.prepare("SELECT featured_first FROM site_settings WHERE id = 1").first<{
    featured_first: number;
  }>();
  const defaultSort = `${settings?.featured_first === 1 ? "d.is_featured DESC," : ""} length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC`;
  const sortSql =
    query.sort === "domain_asc" ? "d.normalized_domain ASC"
    : query.sort === "domain_desc" ? "d.normalized_domain DESC"
    : query.sort === "views_desc" ? "m.views IS NULL, m.views DESC, d.normalized_domain ASC"
    : query.sort === "added_desc" ? "d.created_at DESC, d.normalized_domain ASC"
    : query.sort === "length_asc" ? "length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC"
    : defaultSort;
  const [countResult, dataResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM domains d LEFT JOIN domain_marketplace_listings m ON m.domain_id = d.id WHERE ${where}`).bind(...params),
    c.env.DB.prepare(`${PUBLIC_SELECT} WHERE ${where} ORDER BY ${sortSql} LIMIT ? OFFSET ?`).bind(...params, query.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  return ok(c, {
    items: (dataResult.results as unknown as PublicDomainRow[]).map(serializePublic),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

publicRoutes.get("/domains/:name", async (c) => {
  const name = c.req.param("name").trim().toLowerCase();
  if (!name || name.length > 253) return fail(c, 422, "INVALID_DOMAIN", "域名无效");
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
  return ok(c, {
    domain: serializePublic(row),
    related: (related.results as unknown as PublicDomainRow[]).map(serializePublic),
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

const RDAP_HEADERS = {
  Accept: "application/rdap+json",
  "User-Agent": "WanMi-DomainShowcase/1.0 (+https://wanmi.1n.workers.dev)",
};

interface RdapBootstrap { services?: Array<[string[], string[]]> }

// IANA bootstrap：TLD → 权威 RDAP 服务；边缘缓存 24h，避免每次拉全量文件
async function rdapBaseFor(tld: string): Promise<string | null> {
  const response = await fetch("https://data.iana.org/rdap/dns.json", {
    headers: RDAP_HEADERS,
    signal: AbortSignal.timeout(8000),
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!response.ok) return null;
  const bootstrap: RdapBootstrap = await response.json();
  for (const [tlds, urls] of bootstrap.services ?? []) {
    if (tlds.includes(tld)) return urls.find((url) => url.startsWith("https://")) ?? urls[0] ?? null;
  }
  return null;
}

publicRoutes.get("/rdap/:name", async (c) => {
  const name = c.req.param("name").trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) return fail(c, 422, "INVALID_DOMAIN", "域名无效");
  let payload: RdapResponse | null = null;
  // 优先权威 RDAP（rdap.org 会拒绝部分数据中心出口），失败再兜底 rdap.org
  const tld = name.split(".").pop() ?? "";
  const base = await rdapBaseFor(tld).catch(() => null);
  const endpoints = [
    ...(base ? [`${base.replace(/\/$/, "")}/domain/${encodeURIComponent(name)}`] : []),
    `https://rdap.org/domain/${encodeURIComponent(name)}`,
  ];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      headers: RDAP_HEADERS,
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    }).catch(() => null);
    if (response?.ok) {
      payload = (await response.json().catch(() => null)) as RdapResponse | null;
      if (payload) break;
    }
  }
  if (!payload) return fail(c, 502, "RDAP_UNAVAILABLE", "RDAP 服务暂时不可用");
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
    const settings = await c.env.DB.prepare("SELECT * FROM notification_settings WHERE id = 1").first<
      NotificationSettingsRow & Record<string, unknown>
    >();
    if (!settings) return;
    const message = {
      title: `玩米求购线索：${domain.full_domain}`,
      content: `联系方式：${parsed.data.contact}${parsed.data.amount ? `\n报价：${parsed.data.amount} ${parsed.data.currency ?? ""}` : ""}${parsed.data.message ? `\n留言：${parsed.data.message}` : ""}`,
    };
    await Promise.allSettled(enabledChannels(settings).map((channel) => sendNotification(c.env, channel, settings, message)));
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
  const site = (settings?.site_name ?? "玩米").replace(/[<>&"]/g, "");
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
  <text x="116" y="140" font-family="Kaiti SC, STKaiti, KaiTi, serif" font-size="42" fill="#ffffff" text-anchor="middle">玩</text>
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
