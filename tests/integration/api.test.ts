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
    const [migration, source] = await Promise.all([readAllMigrations(), fs.readFile("data/source/domains-1783619533.csv", "utf8")]);
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

  it("公共 API 返回 662 且不泄露内部字段", async () => {
    const response = await request("/api/public/domains?pageSize=100&q=02cloud.com");
    const body = await response.json() as { data: { total: number; items: Array<Record<string, unknown>> } };
    expect(body.data.total).toBe(1);
    targetId = body.data.items[0].id as number;
    expect(body.data.items[0]).not.toHaveProperty("notes");
    expect(body.data.items[0]).not.toHaveProperty("listing_status");
    const all = await (await request("/api/public/domains?pageSize=100")).json() as { data: { total: number } };
    expect(all.data.total).toBe(662);
  });

  it("CSRF 缺失时拒绝写操作", async () => {
    const response = await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ isListed: false }) });
    expect(response.status).toBe(403);
  });

  it("CSV API dry-run 完整解析 662 条", async () => {
    const source = await fs.readFile("data/source/domains-1783619533.csv", "utf8");
    const form = new FormData();
    form.set("file", new File([source], "domains-1783619533.csv", { type: "text/csv" }));
    form.set("dryRun", "true");
    const response = await request("/api/admin/domains/import", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf },
      body: form,
    });
    const body = await response.json() as { data: { report: { parsedCount: number; uniqueCount: number; invalidCount: number } } };
    expect(response.status).toBe(200);
    expect(body.data.report).toMatchObject({ parsedCount: 662, uniqueCount: 662, invalidCount: 0 });
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
    const featured = await (await request("/api/public/domains?pageSize=10")).json() as { data: { items: Array<{ domain: string }> } };
    expect(featured.data.items[0].domain).toBe("02cloud.com");
    expect((await request(`/api/admin/domains/${targetId}`, { method: "PATCH", headers, body: JSON.stringify({ isFeatured: false }) })).status).toBe(200);
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

  it("退出后旧会话失效", async () => {
    const response = await request("/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf } });
    expect(response.status).toBe(200);
    expect((await request("/api/admin/dashboard", { headers: { Cookie: cookie } })).status).toBe(401);
  });
});
