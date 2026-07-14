import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, statementsToSql } from "../../src/shared/import-plan";
import { app } from "../../src/worker";
import type { Env } from "../../src/worker/types";
import { SqliteD1Database } from "./sqlite-d1";

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
    execFileSync("sqlite3", [databasePath], { input: migration });
    const records = parseDomainCsv(source).records;
    execFileSync("sqlite3", [databasePath], { input: statementsToSql(buildImportStatements(records, { importId: "api-import" })), maxBuffer: 50 * 1024 * 1024 });
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
    expect(body.data.items[0]).not.toHaveProperty("listing_status");
    const all = await (await request("/api/public/domains?pageSize=100")).json() as { data: { total: number } };
    expect(all.data.total).toBe(859);
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
    const body = await response.json() as { data: { report: { parsedCount: number; uniqueCount: number; invalidCount: number } } };
    expect(response.status).toBe(200);
    expect(body.data.report).toMatchObject({ parsedCount: 859, uniqueCount: 859, invalidCount: 0 });
  });

  it("添加重复域名返回冲突", async () => {
    const response = await request("/api/admin/domains", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
      body: JSON.stringify({ fullDomain: "02cloud.com" }),
    });
    expect(response.status).toBe(409);
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

  it("管理员简介与精品修改会立即映射到公共 API 且可恢复", async () => {
    const headers = { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
    const changed = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ description: "集成测试简介", isFeatured: true }) });
    expect(changed.status).toBe(200);
    const changedBody = await changed.json() as { data: { description: string; is_featured: number } };
    expect(changedBody.data).toMatchObject({ description: "集成测试简介", is_featured: 1 });
    const visible = await (await request("/api/public/domains?q=02cloud.com")).json() as { data: { items: Array<{ description: string; is_featured: boolean }> } };
    expect(visible.data.items[0]).toMatchObject({ description: "集成测试简介", is_featured: true });
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ description: "", isFeatured: false }) })).status).toBe(200);
  });

  it("DNS API 失败时不修改本地缓存", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS count FROM dns_records_cache WHERE domain_id = ?").bind(targetId).first<{ count: number }>();
    const response = await request(`/api/admin/domains/${targetId}/dns`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "A", name: "@", content: "192.0.2.10", ttl: 600 }),
    });
    const after = await env.DB.prepare("SELECT COUNT(*) AS count FROM dns_records_cache WHERE domain_id = ?").bind(targetId).first<{ count: number }>();
    expect(response.status).toBe(502);
    expect(after?.count).toBe(before?.count);
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
    const body = await response.json() as { data: { tlds: Array<{ tld: string; count: number }>; categories: Array<{ name: string; count: number }> } };
    expect(body.data.tlds.find((item) => item.tld === "com")?.count).toBeGreaterThan(0);
    expect(body.data.categories.some((item) => ["数字", "字母", "拼音", "英文", "杂米", "其他"].includes(item.name))).toBe(true);
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

  it("退出后旧会话失效", async () => {
    const response = await request("/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf } });
    expect(response.status).toBe(200);
    expect((await request("/api/admin/dashboard", { headers: { Cookie: cookie } })).status).toBe(401);
  });
});
