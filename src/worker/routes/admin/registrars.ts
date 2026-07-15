import { Hono } from "hono";
import { parse as parseTld } from "tldts";

import { normalizeDomain } from "../../../shared/domain";
import { registrarInputSchema, registrarPatchSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import { createProvider } from "../../providers/factory";
import { ProviderError } from "../../providers/types";
import { decryptCredentials, encryptCredentials } from "../../security/crypto";
import type { AppBindings } from "../../types";

interface RegistrarRow {
  id: number;
  provider: string;
  display_name: string;
  encrypted_credentials: string;
  credential_iv: string;
  status: string;
}

function providerFailure(c: Parameters<typeof fail>[0], error: unknown) {
  if (error instanceof ProviderError) {
    const status = error.status === 404 ? 404 : error.status === 422 ? 422 : 502;
    return fail(c, status, error.code, error.message);
  }
  return fail(c, 502, "PROVIDER_ERROR", error instanceof Error ? error.message : "注册商 API 调用失败");
}

export const registrarRoutes = new Hono<AppBindings>();

registrarRoutes.get("/registrars", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, provider, display_name, status, last_tested_at, last_synced_at, last_error,
      created_at, updated_at FROM registrar_accounts ORDER BY created_at DESC`,
  ).all();
  return ok(c, result.results);
});

registrarRoutes.post("/registrars", async (c) => {
  const parsed = registrarInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_REGISTRAR", "注册商账户数据无效", parsed.error.issues);
  const encrypted = await encryptCredentials(parsed.data.credentials, c.env.CREDENTIALS_ENCRYPTION_KEY);
  const result = await c.env.DB.prepare(
    `INSERT INTO registrar_accounts (
      provider, display_name, encrypted_credentials, credential_iv, status
    ) VALUES (?, ?, ?, ?, 'unverified')`,
  )
    .bind(parsed.data.provider, parsed.data.displayName, encrypted.encrypted, encrypted.iv)
    .run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, { action: "registrars.create", resourceType: "registrar_account", resourceId: result.meta.last_row_id, message: `添加注册商账户 ${parsed.data.displayName}`, actorUserId: user.id, success: true });
  return ok(c, { id: result.meta.last_row_id, provider: parsed.data.provider, displayName: parsed.data.displayName, status: "unverified" }, 201);
});

registrarRoutes.patch("/registrars/:id", async (c) => {
  const parsed = registrarPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_REGISTRAR", "注册商账户数据无效", parsed.error.issues);
  const fields: string[] = [];
  const values: Array<string | number> = [];
  if (parsed.data.displayName) { fields.push("display_name = ?"); values.push(parsed.data.displayName); }
  if (parsed.data.credentials) {
    const encrypted = await encryptCredentials(parsed.data.credentials, c.env.CREDENTIALS_ENCRYPTION_KEY);
    fields.push("encrypted_credentials = ?", "credential_iv = ?", "status = 'unverified'", "last_error = NULL");
    values.push(encrypted.encrypted, encrypted.iv);
  }
  if (fields.length === 0) return fail(c, 422, "NO_CHANGES", "没有可保存的修改");
  values.push(Number(c.req.param("id")));
  const result = await c.env.DB.prepare(`UPDATE registrar_accounts SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values).run();
  if (result.meta.changes === 0) return fail(c, 404, "REGISTRAR_NOT_FOUND", "注册商账户不存在");
  return ok(c, { saved: true });
});

registrarRoutes.delete("/registrars/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM registrar_accounts WHERE id = ?").bind(Number(c.req.param("id"))).run();
  if (result.meta.changes === 0) return fail(c, 404, "REGISTRAR_NOT_FOUND", "注册商账户不存在");
  return ok(c, { deleted: true });
});

async function registrar(db: D1Database, id: number): Promise<RegistrarRow | null> {
  return db.prepare("SELECT * FROM registrar_accounts WHERE id = ?").bind(id).first<RegistrarRow>();
}

async function providerFor(c: Parameters<typeof fail>[0], account: RegistrarRow) {
  const credentials = await decryptCredentials(account.encrypted_credentials, account.credential_iv, c.env.CREDENTIALS_ENCRYPTION_KEY);
  return createProvider(account.provider, credentials);
}

registrarRoutes.post("/registrars/:id/test", async (c) => {
  const account = await registrar(c.env.DB, Number(c.req.param("id")));
  if (!account) return fail(c, 404, "REGISTRAR_NOT_FOUND", "注册商账户不存在");
  try {
    const result = await (await providerFor(c, account)).testConnection();
    await c.env.DB.prepare("UPDATE registrar_accounts SET status = 'connected', last_tested_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(account.id).run();
    return ok(c, result);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "连接失败";
    await c.env.DB.prepare("UPDATE registrar_accounts SET status = 'error', last_tested_at = CURRENT_TIMESTAMP, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, account.id).run();
    return providerFailure(c, error);
  }
});

async function syncAccount(c: Parameters<typeof fail>[0], account: RegistrarRow) {
  const syncId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO sync_runs (id, source, registrar_account_id, status) VALUES (?, ?, ?, 'running')").bind(syncId, account.provider, account.id).run();
  try {
    const domains = await (await providerFor(c, account)).listDomains();
    const normalized = domains.flatMap((item) => {
      try {
        const suffix = parseTld(item.domain).publicSuffix ?? undefined;
        return [{ ...normalizeDomain(item.domain, suffix), expiresAt: item.expiresAt }];
      } catch { return []; }
    });
    const existing = new Set<string>();
    for (let start = 0; start < normalized.length; start += 80) {
      const part = normalized.slice(start, start + 80);
      if (!part.length) continue;
      const rows = await c.env.DB.prepare(`SELECT normalized_domain FROM domains WHERE normalized_domain IN (${part.map(() => "?").join(",")})`).bind(...part.map((item) => item.normalizedDomain)).all<{ normalized_domain: string }>();
      rows.results.forEach((row) => existing.add(row.normalized_domain));
    }
    const statement = c.env.DB.prepare(
      `INSERT INTO domains (
        full_domain, normalized_domain, name, tld, is_listed, source, registrar_account_ref, expires_at, source_imported_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(normalized_domain) DO UPDATE SET
        registrar_account_ref = excluded.registrar_account_ref,
        expires_at = COALESCE(excluded.expires_at, domains.expires_at),
        updated_at = CURRENT_TIMESTAMP`,
    );
    for (let start = 0; start < normalized.length; start += 80) {
      const part = normalized.slice(start, start + 80);
      await c.env.DB.batch(part.map((item) => statement.bind(item.fullDomain, item.normalizedDomain, item.name, item.tld, `registrar:${account.provider}`, account.id, item.expiresAt)));
    }
    const inserted = normalized.filter((item) => !existing.has(item.normalizedDomain)).length;
    const updated = normalized.length - inserted;
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE registrar_accounts SET status = 'connected', last_synced_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(account.id),
      c.env.DB.prepare("UPDATE sync_runs SET status = 'completed', inserted_count = ?, updated_count = ?, skipped_count = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(inserted, updated, domains.length - normalized.length, syncId),
    ]);
    const user = c.get("authUser");
    await writeOperationLog(c.env.DB, { action: "registrars.sync", resourceType: "registrar_account", resourceId: account.id, message: `注册商同步完成：新增 ${inserted}，更新 ${updated}`, details: { inserted, updated, skipped: domains.length - normalized.length }, actorUserId: user.id, success: true });
    return { syncId, accountId: account.id, provider: account.provider, inserted, updated, skipped: domains.length - normalized.length };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "同步失败";
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE registrar_accounts SET status = 'error', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, account.id),
      c.env.DB.prepare("UPDATE sync_runs SET status = 'failed', error_count = 1, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, syncId),
    ]);
    throw error;
  }
}

registrarRoutes.post("/registrars/:id/sync", async (c) => {
  const account = await registrar(c.env.DB, Number(c.req.param("id")));
  if (!account) return fail(c, 404, "REGISTRAR_NOT_FOUND", "注册商账户不存在");
  try {
    return ok(c, await syncAccount(c, account));
  } catch (error) {
    return providerFailure(c, error);
  }
});

registrarRoutes.post("/registrars/sync-all", async (c) => {
  const accounts = await c.env.DB.prepare("SELECT * FROM registrar_accounts ORDER BY id").all<RegistrarRow>();
  const results: Array<Record<string, unknown>> = [];
  for (const account of accounts.results) {
    try {
      results.push({ success: true, ...await syncAccount(c, account) });
    } catch (error) {
      results.push({ success: false, accountId: account.id, provider: account.provider, error: error instanceof Error ? error.message : "同步失败" });
    }
  }
  return ok(c, { results, successes: results.filter((item) => item.success === true).length, failures: results.filter((item) => item.success === false).length });
});

export { providerFor, providerFailure, registrar };
