import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { buildRemoteQueryBody, type SqlStatement } from "../src/shared/import-plan";

type SqlValue = string | number | null;
interface D1BatchResponse {
  success?: boolean;
  result?: Array<{ success?: boolean }>;
  errors?: Array<{ code?: number; message?: string }>;
}

const backupArg = process.argv.find((value) => value.startsWith("--backup="));
if (!backupArg) throw new Error("请提供 --backup=<D1 SQL 备份路径>");
const backupPath = path.resolve(backupArg.slice("--backup=".length));
if (!fs.existsSync(backupPath)) throw new Error("指定的 D1 备份不存在");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const source = new DatabaseSync(":memory:");
source.exec("PRAGMA foreign_keys = OFF;");
source.exec(fs.readFileSync(backupPath, "utf8"));

const accounts = source.prepare(`SELECT id, provider, display_name, encrypted_credentials, credential_iv,
  status, last_tested_at, last_synced_at, last_error, created_at, updated_at FROM registrar_accounts ORDER BY id`).all() as Array<Record<string, SqlValue>>;
const leads = source.prepare(`SELECT id, domain_id, offer_amount, currency, contact, message, ip_hash, country,
  status, created_at FROM domain_leads ORDER BY id`).all() as Array<Record<string, SqlValue>>;
const dnsRecords = source.prepare(`SELECT id, domain_id, provider_record_id, type, name, content, ttl, priority,
  proxied, last_synced_at FROM dns_records_cache ORDER BY id`).all() as Array<Record<string, SqlValue>>;
const links = source.prepare(`SELECT normalized_domain, registrar_account_id FROM domains
  WHERE registrar_account_id IS NOT NULL ORDER BY id`).all() as Array<Record<string, SqlValue>>;
source.close();

const statements: SqlStatement[] = [];
for (const row of accounts) {
  statements.push({
    sql: `INSERT OR IGNORE INTO registrar_accounts (
      id, provider, display_name, encrypted_credentials, credential_iv, status,
      last_tested_at, last_synced_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [row.id, row.provider, row.display_name, row.encrypted_credentials, row.credential_iv, row.status,
      row.last_tested_at, row.last_synced_at, row.last_error, row.created_at, row.updated_at],
  });
}
for (const row of leads) {
  statements.push({
    sql: `INSERT OR IGNORE INTO domain_leads (
      id, domain_id, offer_amount, currency, contact, message, ip_hash, country, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [row.id, row.domain_id, row.offer_amount, row.currency, row.contact, row.message,
      row.ip_hash, row.country, row.status, row.created_at],
  });
}
for (const row of dnsRecords) {
  statements.push({
    sql: `INSERT OR IGNORE INTO dns_records_cache (
      id, domain_id, provider_record_id, type, name, content, ttl, priority, proxied, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [row.id, row.domain_id, row.provider_record_id, row.type, row.name, row.content,
      row.ttl, row.priority, row.proxied, row.last_synced_at],
  });
}
for (const row of links) {
  statements.push({
    sql: "UPDATE domains SET registrar_account_ref = ? WHERE normalized_domain = ?",
    params: [row.registrar_account_id, row.normalized_domain],
  });
}

if (process.argv.includes("--dry-run")) {
  console.log(`恢复预览：注册商 ${accounts.length}，线索 ${leads.length}，DNS 缓存 ${dnsRecords.length}，域名关联 ${links.length}。`);
  process.exit(0);
}

if (!accountId || !databaseId || !apiToken) {
  throw new Error("恢复远程数据需要 CLOUDFLARE_ACCOUNT_ID、D1_DATABASE_ID 与 CLOUDFLARE_API_TOKEN");
}

if (statements.length === 0) {
  console.log("备份中没有需要恢复的注册商、DNS 或线索记录。");
  process.exit(0);
}

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(buildRemoteQueryBody(statements)),
});
const body: D1BatchResponse = await response.json();
if (!response.ok || body.success !== true || !Array.isArray(body.result) || body.result.some((item) => item.success !== true)) {
  throw new Error(`远程 D1 恢复未完整提交：HTTP ${response.status} ${JSON.stringify(body.errors ?? [])}`);
}

console.log(`远程 D1 恢复完成：注册商 ${accounts.length}，线索 ${leads.length}，DNS 缓存 ${dnsRecords.length}，域名关联 ${links.length}。`);
