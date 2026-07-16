import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, statementsToSql } from "../../src/shared/import-plan";
import { app } from "../../src/worker";
import type { Env } from "../../src/worker/types";
import { executeSql, SqliteD1Database } from "./sqlite-d1";

async function readAllMigrations(): Promise<string> {
  const entries = (await fs.readdir("migrations")).filter((name) => name.endsWith(".sql")).sort();
  const contents = await Promise.all(entries.map((name) => fs.readFile(`migrations/${name}`, "utf8")));
  return contents.join("\n");
}

describe.sequential("WanMi API 集成", () => {
  let directory: string;
  let env: Env;
  let cookie = "";
  let csrf = "";
  let targetId = 0;
  const origin = "http://localhost";
  const password = "Integration-Test-Password-2026";

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "wanmi-api-"));
    const databasePath = path.join(directory, "wanmi.sqlite");
    const [migration, source] = await Promise.all([readAllMigrations(), fs.readFile("data/source/WanMi.csv", "utf8")]);
    executeSql(databasePath, migration);
    const records = parseDomainCsv(source).records;
    executeSql(databasePath, statementsToSql(buildImportStatements(records, { importId: "api-import" })));
    env = {
      DB: new SqliteD1Database(databasePath) as unknown as D1Database,
      ADMIN_EMAIL: "admin@example.com",
      BOOTSTRAP_ADMIN_PASSWORD: password,
      SESSION_SECRET: "integration-session-secret-at-least-32-bytes",
      CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      ASSETS: { fetch: () => Promise.resolve(new Response("asset")) } as unknown as Fetcher,
      UPLOADS: {} as R2Bucket,
    };
  });
  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  function request(pathname: string, init: RequestInit = {}) { return app.request(`${origin}${pathname}`, init, env); }

  it("SPA 文档允许品牌字体且 API 保持严格 CSP", async () => {
    const [documentResponse, productionDocumentResponse, apiResponse] = await Promise.all([
      request("/"),
      app.request("https://wanmi.org/", {}, env),
      request("/api/health"),
    ]);
    const documentPolicy = documentResponse.headers.get("content-security-policy") ?? "";
    const productionDocumentPolicy = productionDocumentResponse.headers.get("content-security-policy") ?? "";
    const apiPolicy = apiResponse.headers.get("content-security-policy") ?? "";

    expect(documentPolicy).toContain("https://fonts.googleapis.com");
    expect(documentPolicy).toContain("https://fonts.gstatic.com");
    expect(documentPolicy).toContain("script-src 'self' 'unsafe-inline'");
    expect(productionDocumentPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(apiPolicy).toContain("script-src 'self'");
    expect(apiPolicy).not.toContain("fonts.googleapis.com");
  });

  it("未登录访问管理 API 返回 401", async () => expect((await request("/api/admin/dashboard")).status).toBe(401));

  it("错误密码不能登录", async () => {
    const response = await request("/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "wrong" }) });
    expect(response.status).toBe(401);
  });

  it("正确账号密码登录并设置安全会话", async () => {
    const response = await request("/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password }) });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const sessionValue = /wanmi_session=([^;]+)/.exec(setCookie)?.[1];
    const csrfValue = /wanmi_csrf=([^;]+)/.exec(setCookie)?.[1];
    expect(sessionValue).toBeTruthy(); expect(csrfValue).toBeTruthy();
    cookie = `wanmi_session=${sessionValue}; wanmi_csrf=${csrfValue}`;
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
    expect(body.data.items[0]).toHaveProperty("keywords");
    expect(body.data.items[0].keywords).toEqual([]);
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

  it("CSRF 缺失时拒绝写操作", async () => {
    const response = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ isListed: false }) });
    expect(response.status).toBe(403);
  });

  it("CSV API dry-run 完整解析本次数据", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const form = new FormData();
    form.set("file", new File([source], "WanMi.csv", { type: "text/csv" }));
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
    const source = "Domain,TLD\n02cloud.com,com\ncodexwanmi.com,com\n";
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
    const added = await (await request("/api/public/domains?q=codexwanmi.com")).json() as { data: { items: Array<{ id: number }> } };
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

  it("管理员可保存多个加密 AI 配置、切换启用项并生成不自动保存的简介", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const initial = await (await request("/api/admin/ai-configs", { headers })).json() as { data: { items: Array<Record<string, unknown>> } };
    expect(initial.data.items).toHaveLength(1);
    expect(initial.data.items[0]).toMatchObject({ id: "deepseek-default", provider: "deepseek", model: "deepseek-v4-flash", isActive: true, configured: false });
    expect(initial.data.items[0]).not.toHaveProperty("apiKey");

    const defaultUpdated = await request("/api/admin/ai-configs/deepseek-default", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ apiKey: "sk-integration-default" }),
    });
    expect(defaultUpdated.status).toBe(200);
    expect(await defaultUpdated.json()).toMatchObject({ data: { configured: true, isActive: true } });

    const created = await request("/api/admin/ai-configs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "备用兼容配置",
        provider: "openai_compatible",
        baseUrl: "https://ai.example.test/v1",
        model: "example-chat",
        apiKey: "sk-integration-secondary",
        promptTemplate: "请为 {domain} 生成中文简介，后缀 {tld}，长度 {length}，类型 {type}，关键词 {keywords}，只输出正文。",
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { data: { id: string; configured: boolean; isActive: boolean } };
    expect(createdBody.data).toMatchObject({ configured: true, isActive: false });
    expect((await request(`/api/admin/ai-configs/${createdBody.data.id}/activate`, { method: "POST", headers })).status).toBe(200);
    expect((await request(`/api/admin/ai-configs/${createdBody.data.id}`, { method: "DELETE", headers })).status).toBe(409);

    let captured: { url: string; authorization: string; model: string; prompt: string } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { model: string; messages: Array<{ content: string }> };
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      captured = { url, authorization: new Headers(init?.headers).get("Authorization") ?? "", model: body.model, prompt: body.messages[0].content };
      return Response.json({ choices: [{ message: { content: "这是一枚兼具云服务联想与品牌延展空间的域名，适合科技产品、数字平台或企业服务项目使用。" } }] });
    }));
    try {
      const response = await request(`/api/admin/domains/${targetId}/suggest-description`, { method: "POST", headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { description: expect.stringContaining("云服务联想"), config: { name: "备用兼容配置", model: "example-chat" } } });
      expect(captured).toMatchObject({ url: "https://ai.example.test/v1/chat/completions", authorization: "Bearer sk-integration-secondary", model: "example-chat" });
      const capturedRequest = captured as unknown as { prompt: string };
      expect(capturedRequest.prompt).toContain("02cloud.com");
      expect(capturedRequest.prompt).toContain("杂米");
      const unchanged = await env.DB.prepare("SELECT description FROM domains WHERE id = ?").bind(targetId).first<{ description: string }>();
      expect(unchanged?.description).toBe("");

      vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
      const failed = await request(`/api/admin/domains/${targetId}/suggest-description`, { method: "POST", headers });
      expect(failed.status).toBe(502);
      expect(await failed.json()).toMatchObject({ error: { code: "DESCRIPTION_SUGGESTION_FAILED", message: "简介生成失败，请手动填写" } });
    } finally {
      vi.unstubAllGlobals();
    }

    expect((await request("/api/admin/ai-configs/deepseek-default/activate", { method: "POST", headers })).status).toBe(200);
    expect((await request(`/api/admin/ai-configs/${createdBody.data.id}`, { method: "DELETE", headers })).status).toBe(200);
    const secretRow = await env.DB.prepare("SELECT api_key_encrypted FROM ai_configs WHERE id = 'deepseek-default'").first<{ api_key_encrypted: string }>();
    expect(secretRow?.api_key_encrypted).not.toContain("sk-integration-default");
    const log = await env.DB.prepare("SELECT COUNT(*) AS count FROM operation_logs WHERE action LIKE 'ai.config.%'").first<{ count: number }>();
    expect(Number(log?.count)).toBeGreaterThanOrEqual(5);
  });

  it("批量设置关键词会规范化内容并写入操作日志", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const second = await env.DB.prepare("SELECT id FROM domains WHERE id != ? ORDER BY id LIMIT 1").bind(targetId).first<{ id: number }>();
    expect(second).toBeTruthy();
    const ids = [targetId, second!.id];
    const response = await request("/api/admin/domains/bulk", { method: "POST", headers, body: JSON.stringify({ ids, action: "keywords", keywords: "品牌，云服务、未来" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { changed: 2 } });
    const rows = await env.DB.prepare(`SELECT keywords FROM domains WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all<{ keywords: string }>();
    expect(rows.results.map((row) => row.keywords)).toEqual(["品牌,云服务,未来", "品牌,云服务,未来"]);
    const log = await env.DB.prepare("SELECT action, message, details_json FROM operation_logs WHERE action = 'domains.bulk.keywords' ORDER BY id DESC LIMIT 1").first<{ action: string; message: string; details_json: string }>();
    expect(log).toMatchObject({ action: "domains.bulk.keywords", message: "批量设置关键词，影响 2 个域名" });
    expect(JSON.parse(log!.details_json)).toMatchObject({ count: 2, keywords: ["品牌", "云服务", "未来"] });
    expect((await request("/api/admin/domains/bulk", { method: "POST", headers, body: JSON.stringify({ ids, action: "keywords", keywords: "" }) })).status).toBe(200);
  });

  it("精品状态会影响默认排序", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isFeatured: true }) })).status).toBe(200);
    const featured = await (await request("/api/public/domains?pageSize=10")).json() as { data: { items: Array<{ domain: string; is_featured: boolean }> } };
    expect(featured.data.items[0].is_featured).toBe(true);
    const target = await (await request("/api/public/domains?q=02cloud.com")).json() as { data: { items: Array<{ is_featured: boolean }> } };
    expect(target.data.items[0].is_featured).toBe(true);
    for (const sort of ["domain_asc", "domain_desc", "added_desc", "length_asc"]) {
      const sorted = await (await request(`/api/public/domains?pageSize=10&sort=${sort}`)).json() as { data: { items: Array<{ is_featured: boolean }> } };
      expect(sorted.data.items[0].is_featured, `${sort} 仍应精品优先`).toBe(true);
    }
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isFeatured: false }) })).status).toBe(200);
  });

  it("管理员生命周期资料、关键词、简介与精品修改会保存，公开字段立即映射且可恢复", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const changed = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ keywords: "梦想，模型、品牌", description: "集成测试简介", isFeatured: true, registeredAt: "2025-01-07", expiresAt: "2027-01-07", registrarName: "Spaceship" }) });
    expect(changed.status).toBe(200);
    const changedBody = await changed.json() as { data: { keywords: string; description: string; is_featured: number; registered_at: string; expires_at: string; registrar_name: string } };
    expect(changedBody.data).toMatchObject({ keywords: "梦想,模型,品牌", description: "集成测试简介", is_featured: 1, registrar_name: "Spaceship" });
    expect(changedBody.data.registered_at.startsWith("2025-01-07")).toBe(true);
    expect(changedBody.data.expires_at.startsWith("2027-01-07")).toBe(true);
    const visible = await (await request("/api/public/domains?q=02cloud.com")).json() as { data: { items: Array<{ keywords: string[]; description: string; is_featured: boolean }> } };
    expect(visible.data.items[0]).toMatchObject({ keywords: ["梦想", "模型", "品牌"], description: "集成测试简介", is_featured: true });
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ keywords: [], description: "", isFeatured: false }) })).status).toBe(200);
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
