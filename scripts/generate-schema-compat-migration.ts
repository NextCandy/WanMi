import fs from "node:fs/promises";

import { assertExpectedReport, readAndParseSource } from "./domain-csv-common";

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const result = await readAndParseSource();
assertExpectedReport(result);

const registrarBackfill = result.records.flatMap((record) =>
  record.initialRegistrarName
    ? [`UPDATE domains SET registrar_label = ${quote(record.initialRegistrarName)} WHERE normalized_domain = ${quote(record.normalizedDomain)};`]
    : [],
);

const sql = [
  "-- 0015: restore production schema removed by historical drift without renaming legacy columns",
  "PRAGMA foreign_keys = ON;",
  "",
  "CREATE TABLE IF NOT EXISTS registrar_accounts (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  provider TEXT NOT NULL,",
  "  display_name TEXT NOT NULL,",
  "  encrypted_credentials TEXT NOT NULL,",
  "  credential_iv TEXT NOT NULL,",
  "  status TEXT NOT NULL DEFAULT 'unverified',",
  "  last_tested_at TEXT,",
  "  last_synced_at TEXT,",
  "  last_error TEXT,",
  "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
  "  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
  ");",
  "",
  "CREATE TABLE IF NOT EXISTS dns_records_cache (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  domain_id INTEGER NOT NULL,",
  "  provider_record_id TEXT NOT NULL,",
  "  type TEXT NOT NULL,",
  "  name TEXT NOT NULL,",
  "  content TEXT NOT NULL,",
  "  ttl INTEGER,",
  "  priority INTEGER,",
  "  proxied INTEGER CHECK (proxied IN (0, 1)),",
  "  last_synced_at TEXT NOT NULL,",
  "  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,",
  "  UNIQUE (domain_id, provider_record_id)",
  ");",
  "CREATE INDEX IF NOT EXISTS idx_dns_domain ON dns_records_cache(domain_id);",
  "",
  "CREATE TABLE IF NOT EXISTS domain_leads (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  domain_id INTEGER NOT NULL,",
  "  offer_amount TEXT,",
  "  currency TEXT,",
  "  contact TEXT NOT NULL,",
  "  message TEXT,",
  "  ip_hash TEXT,",
  "  country TEXT,",
  "  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),",
  "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,",
  "  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE",
  ");",
  "CREATE INDEX IF NOT EXISTS idx_domain_leads_created ON domain_leads(created_at DESC);",
  "CREATE INDEX IF NOT EXISTS idx_domain_leads_domain ON domain_leads(domain_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS idx_domain_leads_status ON domain_leads(status, created_at DESC);",
  "",
  "-- New compatibility columns are absent from both canonical fresh installs and the drifted production schema.",
  "ALTER TABLE domains ADD COLUMN registrar_label TEXT;",
  "ALTER TABLE domains ADD COLUMN registrar_account_ref INTEGER REFERENCES registrar_accounts(id) ON DELETE SET NULL;",
  "ALTER TABLE domain_import_staging ADD COLUMN registrar_label TEXT;",
  "CREATE INDEX IF NOT EXISTS idx_domains_registrar_account_ref ON domains(registrar_account_ref);",
  "",
  ...registrarBackfill,
  "",
].join("\n");

await fs.writeFile("migrations/0015_restore_domain_management_schema.sql", sql, "utf8");
console.log(`已生成 0015 兼容迁移：${registrarBackfill.length} 条注册商回填。`);
