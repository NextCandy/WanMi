import { Hono } from "hono";

import { fail, ok } from "./http";
import { requireSameOrigin, securityHeaders } from "./middleware/security";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { publicRoutes } from "./routes/public";
import { trackRoutes } from "./routes/track";
import { runExpirationReminders } from "./services/expiration-reminders";
import type { AppBindings, Env } from "./types";

export const app = new Hono<AppBindings>();
app.use("*", securityHeaders);
app.use("/api/*", requireSameOrigin);

app.get("/api/health", (c) => ok(c, { status: "ok", service: "WanMi" }));
app.route("/api/public", publicRoutes);
app.route("/api/track", trackRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);

app.get("/uploads/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/uploads/".length));
  if (!key.startsWith("site/") || key.includes("..")) return fail(c, 404, "UPLOAD_NOT_FOUND", "文件不存在");
  const object = await c.env.UPLOADS.get(key);
  if (!object) return fail(c, 404, "UPLOAD_NOT_FOUND", "文件不存在");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

// 首页由 Worker 注入真实设置、Canonical 与公开域名 ItemList；React 仍负责交互渲染。
app.get("/", async (c) => {
  const url = new URL(c.req.url);
  const shell = await c.env.ASSETS.fetch(new Request(`${url.origin}/`, { headers: c.req.raw.headers }));
  const [settings, domains, count] = await Promise.all([
    c.env.DB.prepare("SELECT site_name, site_description FROM site_settings WHERE id = 1")
      .first<{ site_name: string; site_description: string }>(),
    c.env.DB.prepare(
      `SELECT full_domain, description FROM domains
       WHERE is_listed = 1
       ORDER BY is_featured DESC, length(replace(name, '.', '')) ASC, normalized_domain ASC
       LIMIT 60`,
    ).all<{ full_domain: string; description: string }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM domains WHERE is_listed = 1").first<{ total: number }>(),
  ]);
  const site = settings?.site_name ?? "玩米";
  const title = `${site} · 精选域名展示`;
  const description = settings?.site_description || "发现值得珍藏的域名";
  const canonical = `${url.origin}/`;
  const image = `${url.origin}/api/public/og/wanmi.org`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${site} 公开域名目录`,
    numberOfItems: Number(count?.total ?? domains.results.length),
    itemListElement: domains.results.map((domain, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: domain.full_domain,
      description: domain.description || `${domain.full_domain} 域名`,
      url: `${url.origin}/d/${encodeURIComponent(domain.full_domain)}`,
    })),
  };
  return new HTMLRewriter()
    .on("title", { element: (element) => { element.setInnerContent(title); } })
    .on('meta[name="description"]', { element: (element) => { element.setAttribute("content", description); } })
    .on('meta[property="og:title"]', { element: (element) => { element.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element: (element) => { element.setAttribute("content", description); } })
    .on('meta[property="og:url"]', { element: (element) => { element.setAttribute("content", canonical); } })
    .on('meta[property="og:image"]', { element: (element) => { element.setAttribute("content", image); } })
    .on('meta[name="twitter:title"]', { element: (element) => { element.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element: (element) => { element.setAttribute("content", description); } })
    .on('meta[name="twitter:image"]', { element: (element) => { element.setAttribute("content", image); } })
    .on('link[rel="canonical"]', { element: (element) => { element.setAttribute("href", canonical); } })
    .on("head", { element: (element) => { element.append(`<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>`, { html: true }); } })
    .transform(shell);
});

app.get("/sitemap.xml", async (c) => {
  const origin = new URL(c.req.url).origin;
  const rows = await c.env.DB.prepare(
    "SELECT normalized_domain, updated_at FROM domains WHERE is_listed = 1 ORDER BY normalized_domain",
  ).all<{ normalized_domain: string; updated_at: string }>();
  const urls = [
    `<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...rows.results.map(
      (row) =>
        `<url><loc>${origin}/d/${encodeURIComponent(row.normalized_domain)}</loc><lastmod>${(row.updated_at ?? "").slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    ),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
});

app.get("/robots.txt", (c) => c.text("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/track\nSitemap: https://wanmi.org/sitemap.xml\n"));

// /d/:domain —— 用 HTMLRewriter 在 SPA 外壳上注入独立 title/description/og/JSON-LD，
// 无需完整 SSR 即可满足爬虫抓取；用户侧仍由 React 渲染
app.get("/d/:name", async (c) => {
  const url = new URL(c.req.url);
  const shell = await c.env.ASSETS.fetch(new Request(`${url.origin}/`, { headers: c.req.raw.headers }));
  const name = decodeURIComponent(c.req.param("name")).trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) return shell;
  const [domainRow, settingsRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.full_domain, d.tld, d.description
       FROM domains d WHERE d.is_listed = 1 AND d.normalized_domain = ?`,
    ).bind(name).first<{ full_domain: string; tld: string; description: string }>(),
    c.env.DB.prepare("SELECT site_name FROM site_settings WHERE id = 1").first<{ site_name: string }>(),
  ]);
  if (!domainRow) return shell;
  const site = settingsRow?.site_name ?? "玩米";
  const title = `${domainRow.full_domain} 域名出售 · ${site}`;
  const description = `${domainRow.full_domain} 正在 ${site} 出售，支持 Make Offer 求购。优质 .${domainRow.tld} 域名，即刻联系获取报价。`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: domainRow.full_domain,
    description: domainRow.description || description,
    url: `${url.origin}/d/${encodeURIComponent(name)}`,
    primaryImageOfPage: `${url.origin}/api/public/og/${encodeURIComponent(name)}`,
  };
  return new HTMLRewriter()
    .on("title", { element: (el) => { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element: (el) => { el.setAttribute("content", description); } })
    .on('meta[property="og:title"]', { element: (el) => { el.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element: (el) => { el.setAttribute("content", description); } })
    .on('meta[property="og:url"]', { element: (el) => { el.setAttribute("content", `${url.origin}/d/${encodeURIComponent(name)}`); } })
    .on('meta[property="og:image"]', { element: (el) => { el.setAttribute("content", `${url.origin}/api/public/og/${encodeURIComponent(name)}`); } })
    .on('meta[name="twitter:title"]', { element: (el) => { el.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element: (el) => { el.setAttribute("content", description); } })
    .on('meta[name="twitter:image"]', { element: (el) => { el.setAttribute("content", `${url.origin}/api/public/og/${encodeURIComponent(name)}`); } })
    .on('link[rel="canonical"]', { element: (el) => { el.setAttribute("href", `${url.origin}/d/${encodeURIComponent(name)}`); } })
    .on("head", {
      element: (el) => {
        el.append(`<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>`, { html: true });
      },
    })
    .transform(shell);
});

app.all("/cdn-cgi/handler/scheduled", (c) => fail(c, 404, "NOT_FOUND", "未找到资源"));

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return fail(c, 404, "NOT_FOUND", "未找到 API");
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  console.error("WanMi request failed", error);
  return fail(c, 500, "INTERNAL_ERROR", "服务器内部错误");
});

async function cleanupOperationLogs(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM operation_logs WHERE created_at < datetime('now', '-90 days')").run();
}

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runExpirationReminders(env));
    ctx.waitUntil(cleanupOperationLogs(env));
  },
};
