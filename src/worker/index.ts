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
  const image = `${url.origin}/icon-512.png`;
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
      url: `https://${domain.full_domain}`,
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

app.get("/sitemap.xml", (c) => {
  const origin = new URL(c.req.url).origin;
  const urls = [
    `<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
});

app.get("/robots.txt", (c) => c.text("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/track\nSitemap: https://wanmi.org/sitemap.xml\n"));

// 旧详情链接回到首页搜索结果；卡片本身直接打开域名。
app.get("/d/:name", (c) => {
  const url = new URL(c.req.url);
  const name = decodeURIComponent(c.req.param("name")).trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(name)) return c.redirect(`${url.origin}/`, 302);
  return c.redirect(`${url.origin}/?q=${encodeURIComponent(name)}`, 301);
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
