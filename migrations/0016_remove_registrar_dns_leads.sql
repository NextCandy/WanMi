-- 0016: permanently remove registrar-account, DNS, and enquiry features.
-- registrar_label is the compatibility column guaranteed by 0015 on both the
-- historical production schema and a fresh migration run. It is normalized
-- into registrar_name, which remains plain domain metadata only.
PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS _domain_auto_categories_0016;
CREATE TABLE _domain_auto_categories_0016 AS
  SELECT domain_id, category, created_at FROM domain_auto_categories;

DROP TABLE IF EXISTS _notification_deliveries_0016;
CREATE TABLE _notification_deliveries_0016 AS
  SELECT id, domain_id, channel, reminder_days, scheduled_date, status,
    provider_message_id, error_message, created_at, sent_at
  FROM notification_deliveries;

DROP TABLE IF EXISTS domain_leads;
DROP TABLE IF EXISTS dns_records_cache;

CREATE TABLE domains_0016 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_domain TEXT NOT NULL,
  normalized_domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tld TEXT NOT NULL,
  category TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  is_listed INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
  public_price TEXT,
  public_price_currency TEXT,
  public_price_approved INTEGER NOT NULL DEFAULT 0 CHECK (public_price_approved IN (0, 1)),
  notes TEXT,
  source TEXT NOT NULL,
  source_imported_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT NOT NULL DEFAULT '',
  auto_category TEXT NOT NULL DEFAULT '其他',
  auto_subcategory TEXT NOT NULL DEFAULT 'other',
  auto_category_confidence REAL NOT NULL DEFAULT 0,
  registered_at TEXT,
  registrar_name TEXT
);

INSERT INTO domains_0016 (
  id, full_domain, normalized_domain, name, tld, category,
  is_featured, is_listed, public_price, public_price_currency, public_price_approved,
  notes, source, source_imported_at, expires_at, created_at, updated_at,
  description, auto_category, auto_subcategory, auto_category_confidence,
  registered_at, registrar_name
)
SELECT
  id, full_domain, normalized_domain, name, tld, category,
  is_featured, is_listed, public_price, public_price_currency, public_price_approved,
  notes, source, source_imported_at, expires_at, created_at, updated_at,
  description, auto_category, auto_subcategory, auto_category_confidence,
  registered_at, COALESCE(NULLIF(registrar_label, ''), NULLIF(registrar, ''))
FROM domains;

DROP TABLE domains;
ALTER TABLE domains_0016 RENAME TO domains;

DELETE FROM domain_auto_categories;
INSERT INTO domain_auto_categories (domain_id, category, created_at)
  SELECT domain_id, category, created_at FROM _domain_auto_categories_0016;
DROP TABLE _domain_auto_categories_0016;

DELETE FROM notification_deliveries;
INSERT INTO notification_deliveries (
  id, domain_id, channel, reminder_days, scheduled_date, status,
  provider_message_id, error_message, created_at, sent_at
)
SELECT
  id, domain_id, channel, reminder_days, scheduled_date, status,
  provider_message_id, error_message, created_at, sent_at
FROM _notification_deliveries_0016;
DROP TABLE _notification_deliveries_0016;

-- The staging table is transient. Rebuilding it avoids depending on whether
-- an older installation called the metadata column registrar or registrar_name.
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
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  auto_category TEXT NOT NULL DEFAULT '其他',
  auto_subcategory TEXT NOT NULL DEFAULT 'other',
  auto_category_confidence REAL NOT NULL DEFAULT 0,
  registered_at TEXT,
  expires_at TEXT,
  registrar_name TEXT,
  PRIMARY KEY (import_id, normalized_domain)
);
CREATE INDEX idx_import_staging_id ON domain_import_staging(import_id);

DROP TABLE IF EXISTS registrar_accounts;

CREATE INDEX idx_domains_public_sort ON domains(is_listed, is_featured DESC, name, normalized_domain);
CREATE INDEX idx_domains_tld ON domains(tld, is_listed);
CREATE INDEX idx_domains_category ON domains(category, is_listed);
CREATE INDEX idx_domains_public_filter ON domains(is_listed, is_featured, tld, public_price);
CREATE INDEX idx_domains_public_version ON domains(is_listed, updated_at DESC);
CREATE INDEX idx_domains_auto_category ON domains(auto_category, is_listed);
CREATE INDEX idx_domains_expires_at ON domains(expires_at);

CREATE TRIGGER domains_public_version_insert AFTER INSERT ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
CREATE TRIGGER domains_public_version_update AFTER UPDATE ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
CREATE TRIGGER domains_public_version_delete AFTER DELETE ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
