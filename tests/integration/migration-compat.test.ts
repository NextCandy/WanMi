import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeSql, queryRows } from "./sqlite-d1";

const HISTORICAL_LIFECYCLE_SCHEMA = `
ALTER TABLE domains ADD COLUMN registered_at TEXT;
ALTER TABLE domains ADD COLUMN registrar TEXT;
DROP TABLE domain_import_staging;
CREATE TABLE domain_import_staging (
  import_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  full_domain TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,
  name TEXT NOT NULL,
  tld TEXT NOT NULL,
  is_listed INTEGER NOT NULL,
  source_file TEXT NOT NULL,
  raw_metadata_json TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT,
  expires_at TEXT,
  registrar TEXT,
  auto_category TEXT NOT NULL DEFAULT '其他',
  auto_subcategory TEXT NOT NULL DEFAULT 'other',
  auto_category_confidence REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (import_id, normalized_domain)
);
CREATE INDEX idx_import_staging_id ON domain_import_staging(import_id);
CREATE INDEX idx_domains_expires_at ON domains(expires_at);
`;

const ACCIDENTAL_RESTORE_SCHEMA = `
CREATE TABLE registrar_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  credential_iv TEXT NOT NULL
);
CREATE TABLE dns_records_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE
);
CREATE TABLE domain_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  contact TEXT NOT NULL
);
ALTER TABLE domains ADD COLUMN registrar_label TEXT;
ALTER TABLE domains ADD COLUMN registrar_account_ref INTEGER REFERENCES registrar_accounts(id) ON DELETE SET NULL;
ALTER TABLE domain_import_staging ADD COLUMN registrar_label TEXT;
`;

describe("0016 历史生产兼容迁移", () => {
  let directory: string;
  let databasePath: string;

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "wanmi-migration-compat-"));
    databasePath = path.join(directory, "wanmi.sqlite");
    const baseNames = [
      "0001_initial_schema.sql",
      "0002_leads_categories_indexes.sql",
      "0003_webhook_channels.sql",
      "0004_domain_auto_categories.sql",
      "0005_remove_marketplace_metadata.sql",
      "0006_domain_descriptions.sql",
      "0007_domain_classification.sql",
      "0008_drop_registrar_dns_leads.sql",
      "0008_notify_channels.sql",
      "0009_site_visibility.sql",
      "0010_stats_events.sql",
      "0011_contacts_ip_turnstile.sql",
    ];
    const [base, removal] = await Promise.all([
      Promise.all(baseNames.map((name) => fs.readFile(`migrations/${name}`, "utf8"))),
      fs.readFile("migrations/0016_remove_registrar_dns_leads.sql", "utf8"),
    ]);
    const seed = `
INSERT INTO domains (
  id, full_domain, normalized_domain, name, tld, is_featured, is_listed,
  source, expires_at, description, auto_category, auto_subcategory,
  auto_category_confidence, registered_at, registrar, registrar_label
) VALUES (
  42, 'compat.example', 'compat.example', 'compat', 'example', 1, 1,
  'manual', '2028-01-02', '兼容数据', '英文词语', 'english',
  0.9, '2025-01-02', 'Historical Registrar', 'Canonical Registrar'
);
INSERT INTO domains (
  id, full_domain, normalized_domain, name, tld, is_featured, is_listed,
  source, expires_at, description, auto_category, auto_subcategory,
  auto_category_confidence, registered_at, registrar, registrar_label
) VALUES (
  43, 'legacy-only.example', 'legacy-only.example', 'legacy-only', 'example', 0, 1,
  'manual', '2029-01-02', '仅旧列数据', '英文词语', 'english',
  0.8, '2026-01-02', 'Legacy Only Registrar', NULL
);
INSERT INTO domain_auto_categories (domain_id, category) VALUES (42, '纯字母');
INSERT INTO notification_deliveries (
  id, domain_id, channel, reminder_days, scheduled_date, status
) VALUES ('delivery-42', 42, 'email', 30, '2027-12-03', 'sent');
INSERT INTO registrar_accounts (id, provider, display_name, encrypted_credentials, credential_iv)
VALUES (1, 'legacy', '旧账户', 'ciphertext', 'iv');
INSERT INTO dns_records_cache (domain_id) VALUES (42);
INSERT INTO domain_leads (domain_id, contact) VALUES (42, 'removed@example.test');
`;
    executeSql(databasePath, [
      ...base,
      HISTORICAL_LIFECYCLE_SCHEMA,
      ACCIDENTAL_RESTORE_SCHEMA,
      seed,
      removal,
    ].join("\n"));
  });

  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  it("保留域名、分类与通知历史，并规范化注册商文字列", () => {
    expect(queryRows(databasePath, "SELECT id, normalized_domain, registrar_name FROM domains ORDER BY id")).toEqual([
      { id: 42, normalized_domain: "compat.example", registrar_name: "Canonical Registrar" },
      { id: 43, normalized_domain: "legacy-only.example", registrar_name: "Legacy Only Registrar" },
    ]);
    expect(queryRows(databasePath, "SELECT domain_id, category FROM domain_auto_categories")).toEqual([
      { domain_id: 42, category: "纯字母" },
    ]);
    expect(queryRows(databasePath, "SELECT id, domain_id, status FROM notification_deliveries")).toEqual([
      { id: "delivery-42", domain_id: 42, status: "sent" },
    ]);
  });

  it("彻底移除账户、DNS 与线索表，并提供规范化导入暂存列", () => {
    const tables = queryRows<{ name: string }>(databasePath, "SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
    expect(tables).not.toContain("registrar_accounts");
    expect(tables).not.toContain("dns_records_cache");
    expect(tables).not.toContain("domain_leads");
    const columns = queryRows<{ name: string }>(databasePath, "PRAGMA table_info(domain_import_staging)").map((row) => row.name);
    expect(columns).toContain("registrar_name");
    expect(columns).not.toContain("registrar");
    expect(columns).not.toContain("registrar_label");
  });
});
