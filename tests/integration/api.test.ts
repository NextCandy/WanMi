import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, statementsToSql } from "../../src/shared/import-plan";
import { app } from "../../src/worker";
import { loadFeaturedDomainDetail, renderFeaturedDomainSsr } from "../../src/worker/services/featured-domain";
import type { Env } from "../../src/worker/types";
import { executeSql, SqliteD1Database } from "./sqlite-d1";

async function readAllMigrations(): Promise<string> {
  const entries = (await fs.readdir("migrations")).filter((name) => name.endsWith(".sql")).sort();
  const contents = await Promise.all(entries.map((name) => fs.readFile(`migrations/${name}`, "utf8")));
  return contents.join("\n");
}

describe.sequential("UnUseDomain API 集成", () => {
  let directory: string;
  let env: Env;
  let cookie = "";
  let csrf = "";
  let targetId = 0;
  const origin = "http://localhost";
  const password = "Integration-Test-Password-2026";

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "unusedomain-api-"));
    const databasePath = path.join(directory, "unusedomain.sqlite");
    const [migration, source, htmlShell, cormorantGaramond, notoSansSc] = await Promise.all([
      readAllMigrations(),
      fs.readFile("data/source/UnUseDomain.csv", "utf8"),
      fs.readFile("index.html", "utf8"),
      fs.readFile("public/fonts/CormorantGaramond-Regular.ttf"),
      fs.readFile("public/fonts/NotoSansSC-UnUseDomain.ttf"),
    ]);
    executeSql(databasePath, migration);
    const records = parseDomainCsv(source).records;
    executeSql(databasePath, statementsToSql(buildImportStatements(records, { importId: "api-import" })));
    const assetResponse = (value: Uint8Array, contentType: string) => {
      const body = new Uint8Array(value.byteLength);
      body.set(value);
      return new Response(body.buffer, { headers: { "Content-Type": contentType } });
    };
    env = {
      DB: new SqliteD1Database(databasePath) as unknown as D1Database,
      ADMIN_EMAIL: "admin@example.com",
      BOOTSTRAP_ADMIN_PASSWORD: password,
      SESSION_SECRET: "integration-session-secret-at-least-32-bytes",
      CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      ASSETS: {
        fetch: (input: RequestInfo | URL) => {
          const requestUrl = new URL(input instanceof Request ? input.url : String(input));
          if (requestUrl.pathname === "/fonts/CormorantGaramond-Regular.ttf") return Promise.resolve(assetResponse(cormorantGaramond, "font/ttf"));
          if (requestUrl.pathname === "/fonts/NotoSansSC-UnUseDomain.ttf") return Promise.resolve(assetResponse(notoSansSc, "font/ttf"));
          return Promise.resolve(new Response(htmlShell, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
        },
      } as unknown as Fetcher,
      UPLOADS: {} as R2Bucket,
    };
  });
  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  function request(pathname: string, init: RequestInit = {}) { return app.request(`${origin}${pathname}`, init, env); }

  it("SPA 文档允许品牌字体且 API 保持严格 CSP", async () => {
    const [documentResponse, productionDocumentResponse, apiResponse] = await Promise.all([
      request("/"),
      app.request("https://unusedomain.com/", {}, env),
      request("/api/health"),
    ]);
    const documentPolicy = documentResponse.headers.get("content-security-policy") ?? "";
    const productionDocumentPolicy = productionDocumentResponse.headers.get("content-security-policy") ?? "";
    const apiPolicy = apiResponse.headers.get("content-security-policy") ?? "";

    // 字体全部自托管后 CSP 不再放行 Google Fonts（外链 stylesheet 在国内会阻塞渲染）
    expect(documentPolicy).not.toContain("fonts.googleapis.com");
    expect(documentPolicy).not.toContain("fonts.gstatic.com");
    expect(documentPolicy).toContain("font-src 'self'");
    expect(documentPolicy).toContain("script-src 'self' 'unsafe-inline'");
    expect(productionDocumentPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(apiPolicy).toContain("script-src 'self'");
    expect(apiPolicy).not.toContain("fonts.googleapis.com");
  });

  it("所有 SPA HTML 入口禁用旧缓存并只清理一次浏览器缓存", async () => {
    const first = await request("/domains");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(first.headers.get("cdn-cache-control")).toBe("no-store");
    expect(first.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(first.headers.get("clear-site-data")).toBe('"cache"');
    expect(first.headers.get("x-unusedomain-build")).toBe("unusedomain-2026-07-20-v1");
    expect(first.headers.get("etag")).toBeNull();

    const cacheCookie = first.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cacheCookie).toBe("unusedomain_html_cache=unusedomain-2026-07-20-v1");
    const subsequent = await request("/admin", { headers: { Cookie: cacheCookie! } });
    expect(subsequent.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(subsequent.headers.get("clear-site-data")).toBeNull();
    expect(subsequent.headers.get("x-unusedomain-build")).toBe("unusedomain-2026-07-20-v1");
  });

  it("精品域名详情查询与 SSR 标记包含完整内容和两组推荐", async () => {
    const detail = await loadFeaturedDomainDetail(env.DB, "mx.ooo");
    expect(detail).not.toBeNull();
    expect(detail!.domain).toMatchObject({ domain: "mx.ooo", is_featured: true, character_count: 2 });
    expect(["纯字母", "字母"]).toContain(detail!.domain.type);
    expect(detail!.same_tld).toHaveLength(3);
    expect(detail!.same_length).toHaveLength(3);

    const html = renderFeaturedDomainSsr(detail!);
    expect(html).toContain('data-featured-detail-ssr');
    expect(html).toContain("<h1>mx.ooo</h1>");
    expect(html).toContain("Visit this domain →");
    expect(html).toContain("Similar domains");
  });

  it("普通或不存在的域名详情链接仍重定向到目录搜索", async () => {
    const response = await request("/d/nonfeatured.com");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("http://localhost/domains?q=nonfeatured.com");
  });

  it("精品 OG 接口生成 1200x630 PNG，普通域名返回 404", async () => {
    const [featured, ordinary] = await Promise.all([
      request("/api/public/og/mx.ooo"),
      request("/api/public/og/wanmi.org"),
    ]);
    const bytes = new Uint8Array(await featured.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(featured.status).toBe(200);
    expect(featured.headers.get("content-type")).toBe("image/png");
    expect(featured.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
    expect(ordinary.status).toBe(404);
  });

  it("sitemap 包含首页与全部 87 个精品详情页", async () => {
    const response = await request("/sitemap.xml");
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(locations).toHaveLength(88);
    expect(locations[0]).toBe("http://localhost/");
    expect(locations).toContain("http://localhost/d/mx.ooo");
  });

  it("未登录访问管理 API 返回 401", async () => expect((await request("/api/admin/dashboard")).status).toBe(401));

  it("公开站点设置禁用缓存以便后台联系方式即时生效", async () => {
    const response = await request("/api/public/settings");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("错误密码不能登录", async () => {
    const response = await request("/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "wrong" }) });
    expect(response.status).toBe(401);
  });

  it("正确账号密码登录并设置安全会话", async () => {
    const response = await request("/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password }) });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const sessionValue = /unusedomain_session=([^;]+)/.exec(setCookie)?.[1];
    const csrfValue = /unusedomain_csrf=([^;]+)/.exec(setCookie)?.[1];
    expect(sessionValue).toBeTruthy(); expect(csrfValue).toBeTruthy();
    cookie = `unusedomain_session=${sessionValue}; unusedomain_csrf=${csrfValue}`;
    csrf = decodeURIComponent(csrfValue!);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("公共 API 返回真实数据且不泄露内部字段", async () => {
    const response = await request("/api/public/domains?pageSize=100&q=02cloud.com");
    const body = await response.json() as { data: { total: number; items: Array<Record<string, unknown>> } };
    expect(body.data.total).toBe(1);
    targetId = body.data.items[0].id as number;
    expect(body.data.items[0]).not.toHaveProperty("notes");
    expect(body.data.items[0]).toHaveProperty("description", "");
    expect(body.data.items[0]).not.toHaveProperty("listing_status");
    const all = await (await request("/api/public/domains?pageSize=100")).json() as { data: { total: number } };
    expect(all.data.total).toBe(859);
  });

  it("首页元数据返回动态统计与最近更新的九件精品", async () => {
    const featuredRows = await env.DB.prepare("SELECT id, is_featured, updated_at FROM domains ORDER BY id LIMIT 10")
      .all<{ id: number; is_featured: number; updated_at: string }>();
    const ids = featuredRows.results.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE domains SET is_featured = 1, updated_at = datetime('2099-07-16 00:00:00', '+' || id || ' seconds') WHERE id IN (${placeholders})`)
      .bind(...ids).run();
    try {
      const response = await request("/api/public/facets");
      const body = await response.json() as { data: {
        tlds: string[];
        total_domains: number;
        total_tlds: number;
        total_featured: number;
        featured_domains: Array<{ id: number; is_featured: boolean }>;
      } };
      expect(response.status).toBe(200);
      expect(body.data.total_domains).toBe(859);
      expect(body.data.total_tlds).toBe(body.data.tlds.length);
      expect(body.data.total_featured).toBeGreaterThanOrEqual(10);
      expect(body.data.featured_domains).toHaveLength(9);
      expect(body.data.featured_domains.every((domain) => domain.is_featured)).toBe(true);
      expect(body.data.featured_domains.map((domain) => domain.id)).toEqual([...ids].sort((left, right) => right - left).slice(0, 9));
    } finally {
      for (const row of featuredRows.results) {
        await env.DB.prepare("UPDATE domains SET is_featured = ?, updated_at = ? WHERE id = ?")
          .bind(row.is_featured, row.updated_at, row.id).run();
      }
    }
  });

  it("公共 API 高级筛选保持真实分页并校验长度范围", async () => {
    const response = await request("/api/public/domains?contains=cloud&kind=alphanumeric&pageSize=100");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { total: number; items: Array<{ name: string }> } };
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.name.includes("cloud") && /[a-z]/.test(item.name) && /[0-9]/.test(item.name))).toBe(true);
    expect((await request("/api/public/domains?minLength=8&maxLength=2")).status).toBe(422);
  });

  it("公共 API 支持六种目录排序并让随机结果绕过缓存", async () => {
    const fetchItems = async (sort: string) => {
      const response = await request(`/api/public/domains?pageSize=100&sort=${sort}`);
      expect(response.status).toBe(200);
      const body = await response.json() as { data: { items: Array<{ id: number; name: string; tld: string; is_featured: boolean }> } };
      return { response, items: body.data.items };
    };

    // 默认序：精品优先，精品组只按位数升序、普通组只按后缀优先级
    const expectedDefault = await env.DB.prepare(
      `SELECT id FROM domains WHERE is_listed = 1
       ORDER BY is_featured DESC,
         CASE WHEN is_featured = 1 THEN length(name) END ASC,
         CASE WHEN is_featured = 0 THEN
           CASE lower(tld) WHEN 'com' THEN 0 WHEN 'cn' THEN 1 WHEN 'net' THEN 2 WHEN 'org' THEN 3 WHEN 'io' THEN 4 WHEN 'is' THEN 5 WHEN 'do' THEN 6 ELSE 7 END
         END ASC,
         normalized_domain ASC LIMIT 100`,
    ).all<{ id: number }>();
    const expectedAdded = await env.DB.prepare(
      "SELECT id FROM domains WHERE is_listed = 1 ORDER BY created_at DESC, normalized_domain ASC LIMIT 100",
    ).all<{ id: number }>();
    const defaults = await fetchItems("default");
    const added = await fetchItems("added_desc");
    const lengthAscending = await fetchItems("length_asc");
    const lengthDescending = await fetchItems("length_desc");
    const tldAscending = await fetchItems("tld_asc");
    const randomFirst = await fetchItems("random");
    const randomSecond = await fetchItems("random");

    expect(defaults.items.map((item) => item.id)).toEqual(expectedDefault.results.map((item) => item.id));
    const tldPriority = (tld: string) => ["com", "cn", "net", "org", "io", "is", "do"].indexOf(tld) + 1 || 8;
    const expectedDefaultOrder = [...defaults.items].sort((left, right) =>
      Number(right.is_featured) - Number(left.is_featured)
      || (left.is_featured
        ? left.name.length - right.name.length
        : tldPriority(left.tld) - tldPriority(right.tld)),
    );
    expect(defaults.items.map((item) => item.id)).toEqual(expectedDefaultOrder.map((item) => item.id));
    expect(added.items.map((item) => item.id)).toEqual(expectedAdded.results.map((item) => item.id));
    expect(lengthAscending.items.map((item) => item.name.replaceAll(".", "").length)).toEqual(
      [...lengthAscending.items].map((item) => item.name.replaceAll(".", "").length).sort((left, right) => left - right),
    );
    expect(lengthDescending.items.map((item) => item.name.replaceAll(".", "").length)).toEqual(
      [...lengthDescending.items].map((item) => item.name.replaceAll(".", "").length).sort((left, right) => right - left),
    );
    expect(tldAscending.items.map((item) => item.tld)).toEqual(
      [...tldAscending.items].map((item) => item.tld).sort((left, right) => left.localeCompare(right)),
    );
    expect(randomFirst.response.headers.get("cache-control")).toBe("no-store");
    expect(randomFirst.items.map((item) => item.id)).not.toEqual(randomSecond.items.map((item) => item.id));
    expect((await request("/api/public/domains?sort=unsupported")).status).toBe(422);
  });

  it("CSRF 缺失时拒绝写操作", async () => {
    const response = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ isListed: false }) });
    expect(response.status).toBe(403);
  });

  it("CSV API dry-run 完整解析本次数据", async () => {
    const source = await fs.readFile("data/source/UnUseDomain.csv", "utf8");
    const form = new FormData();
    form.set("file", new File([source], "UnUseDomain.csv", { type: "text/csv" }));
    form.set("dryRun", "true");
    const response = await request("/api/admin/domains/import", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf },
      body: form,
    });
    const body = await response.json() as { data: { report: { parsedCount: number; uniqueCount: number; invalidCount: number }; preview: { newRows: number; existingRows: number; invalidRows: number } } };
    expect(response.status).toBe(200);
    expect(body.data.report).toMatchObject({ parsedCount: 859, uniqueCount: 859, invalidCount: 0 });
    expect(body.data.preview).toMatchObject({ newRows: 0, existingRows: 859, invalidRows: 0 });
  });

  it("CSV 预览区分新增与冲突，默认跳过不会归档文件外数据", async () => {
    const source = "Domain,TLD\n02cloud.com,com\ncodexunusedomain.com,com\n";
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf };
    const previewForm = new FormData();
    previewForm.set("file", new File([source], "preview.csv", { type: "text/csv" }));
    previewForm.set("dryRun", "true");
    const previewResponse = await request("/api/admin/domains/import", { method: "POST", headers, body: previewForm });
    const preview = await previewResponse.json() as { data: { preview: { newRows: number; existingRows: number } } };
    expect(preview.data.preview).toMatchObject({ newRows: 1, existingRows: 1 });

    const importForm = new FormData();
    importForm.set("file", new File([source], "preview.csv", { type: "text/csv" }));
    importForm.set("conflictMode", "skip");
    const importResponse = await request("/api/admin/domains/import", { method: "POST", headers, body: importForm });
    const imported = await importResponse.json() as { data: { inserted: number; updated: number; skipped: number } };
    expect(imported.data).toMatchObject({ inserted: 1, updated: 0, skipped: 1 });
    const all = await (await request("/api/public/domains?pageSize=1")).json() as { data: { total: number } };
    expect(all.data.total).toBe(860);
    const added = await (await request("/api/public/domains?q=codexunusedomain.com")).json() as { data: { items: Array<{ id: number }> } };
    expect(added.data.items).toHaveLength(1);
    expect((await request(`/api/admin/domains/${added.data.items[0].id}`, { method: "DELETE", headers })).status).toBe(200);
    const restored = await (await request("/api/public/domains?pageSize=1")).json() as { data: { total: number } };
    expect(restored.data.total).toBe(859);
  });

  it("添加重复域名返回冲突", async () => {
    const response = await request("/api/admin/domains", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
      body: JSON.stringify({ fullDomain: "02cloud.com" }),
    });
    expect(response.status).toBe(409);
  });


  it("精品状态会立即影响公开精品筛选", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isFeatured: true }) })).status).toBe(200);
    const target = await (await request("/api/public/domains?q=02cloud.com&featured=true")).json() as { data: { items: Array<{ is_featured: boolean }> } };
    expect(target.data.items).toHaveLength(1);
    expect(target.data.items[0].is_featured).toBe(true);
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isFeatured: false }) })).status).toBe(200);
    const hidden = await (await request("/api/public/domains?q=02cloud.com&featured=true")).json() as { data: { items: unknown[] } };
    expect(hidden.data.items).toHaveLength(0);
  });

  it("管理员生命周期资料、关键词、简介与精品修改会保存，公开字段立即映射且可恢复", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const changed = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ description: "集成测试简介", isFeatured: true, registeredAt: "2025-01-07", expiresAt: "2027-01-07", registrarName: "Spaceship" }) });
    expect(changed.status).toBe(200);
    const changedBody = await changed.json() as { data: { description: string; is_featured: number; registered_at: string; expires_at: string; registrar_name: string } };
    expect(changedBody.data).toMatchObject({ description: "集成测试简介", is_featured: 1, registrar_name: "Spaceship" });
    expect(changedBody.data.registered_at.startsWith("2025-01-07")).toBe(true);
    expect(changedBody.data.expires_at.startsWith("2027-01-07")).toBe(true);
    const visible = await (await request("/api/public/domains?q=02cloud.com")).json() as { data: { items: Array<{ description: string; is_featured: boolean }> } };
    expect(visible.data.items[0]).toMatchObject({ description: "集成测试简介", is_featured: true });
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ description: "", isFeatured: false }) })).status).toBe(200);
  });

  // 注册商 / DNS 解析 / 求购线索已整体移除，对应端点必须不再可达
  it("已移除的注册商、DNS 与求购线索端点全部 404", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const gone = [
      await request("/api/admin/registrars", { headers }),
      await request("/api/admin/leads", { headers }),
      await request(`/api/admin/domains/${targetId}/dns`, { headers }),
      await request("/api/public/offers", { method: "POST", headers, body: JSON.stringify({ domain: "02cloud.com", contact: "a@b.com" }) }),
      await request("/api/public/rdap/02cloud.com"),
      await request("/api/public/domains/02cloud.com"),
    ];
    for (const response of gone) expect(response.status).toBe(404);
  });

  it("隐藏和重新上架会立即影响公共 API", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isListed: false }) })).status).toBe(200);
    expect(((await (await request("/api/public/domains?q=02cloud.com")).json()) as { data: { total: number } }).data.total).toBe(0);
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isListed: true }) })).status).toBe(200);
    expect(((await (await request("/api/public/domains?q=02cloud.com")).json()) as { data: { total: number } }).data.total).toBe(1);
  });

  it("后台域名筛选接口返回真实后缀与自动分类统计", async () => {
    const response = await request("/api/admin/domains/filters", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { tlds: Array<{ tld: string; count: number }>; categories: Array<{ name: string; count: number }>; registrars: Array<{ registrar: string; count: number }> } };
    expect(body.data.tlds.find((item) => item.tld === "com")?.count).toBeGreaterThan(0);
    expect(body.data.categories.some((item) => ["数字", "字母", "拼音", "英文", "杂米", "其他"].includes(item.name))).toBe(true);
    expect(body.data.registrars.some((item) => item.registrar === "Spaceship" && item.count > 0)).toBe(true);
  });

  it("后台可按注册日期、到期日期、注册商筛选并排序", async () => {
    const headers = { Cookie: cookie };
    const filtered = await request("/api/admin/domains?registrar=Spaceship&registeredFrom=2025-01-01&registeredTo=2025-01-31&expiresFrom=2027-01-01&expiresTo=2027-01-31&orderBy=expires_at&dir=asc", { headers });
    expect(filtered.status).toBe(200);
    const body = await filtered.json() as { data: { items: Array<{ registrar_name: string; registered_at: string; expires_at: string }> } };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.registrar_name === "Spaceship" && item.registered_at.startsWith("2025-01-") && item.expires_at.startsWith("2027-01-"))).toBe(true);
    expect(body.data.items.map((item) => item.expires_at)).toEqual([...body.data.items.map((item) => item.expires_at)].sort());
  });

  it("站点设置完整表单可保存数值型开关", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const current = await (await request("/api/admin/settings", { headers: { Cookie: cookie } })).json() as { data: Record<string, unknown> & { featured_first: number; show_prices: number } };
    const response = await request("/api/admin/settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...current.data,
        featured_first: Boolean(current.data.featured_first),
        show_prices: Boolean(current.data.show_prices),
      }),
    });
    expect(response.status).toBe(200);
  });

  it("匿名统计仅保存 UA 摘要并进入概览", async () => {
    const visitorId = crypto.randomUUID();
    const response = await request("/api/track", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 Windows Chrome/120 private-token" }, body: JSON.stringify({ kind: "page_view", path: "/", visitor_id: visitorId }) });
    expect(response.status).toBe(201);
    const row = await env.DB.prepare("SELECT visitor_id, ua_summary FROM stats_events WHERE visitor_id = ?").bind(visitorId).first<{ visitor_id: string; ua_summary: string }>();
    expect(row?.ua_summary).toBe("Chrome / Windows");
    expect(JSON.stringify(row)).not.toContain("private-token");
    const dashboard = await (await request("/api/admin/dashboard", { headers: { Cookie: cookie } })).json() as { data: { stats: { today: { pv: number; uv: number } } } };
    expect(dashboard.data.stats.today.pv).toBeGreaterThan(0);
    expect(dashboard.data.stats.today.uv).toBeGreaterThan(0);
  });

  it("操作日志返回操作者并支持动作筛选", async () => {
    const response = await request("/api/admin/logs?action=domains.import&pageSize=20", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { items: Array<{ action: string; actor_email: string }> } };
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.action === "domains.import")).toBe(true);
    expect(body.data.items.some((item) => item.actor_email === "admin@example.com")).toBe(true);
  });

  it("退出后旧会话失效", async () => {
    const response = await request("/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf } });
    expect(response.status).toBe(200);
    expect((await request("/api/admin/dashboard", { headers: { Cookie: cookie } })).status).toBe(401);
  });
});
