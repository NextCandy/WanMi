-- 0008: 移除注册商 / DNS 解析 / 求购线索三块功能，并清掉它们的表
--
-- 注意事项（改动这段前务必读完）：
-- 1. registrar_accounts 是 domains.registrar_account_id 的外键父表，不能直接 DROP。
--    SQLite 也不允许在开启外键时 DROP 掉出现在 REFERENCES 子句里的列，
--    因此必须整表重建 domains，把该列和外键一起去掉。
-- 2. DROP TABLE domains 会执行一次隐式 DELETE，从而触发 domain_auto_categories 的
--    ON DELETE CASCADE，把多标签分类数据全部清空。所以先备份、重建完再灌回去。
-- 3. domains 上的索引和触发器会随 DROP TABLE 一起消失，必须原样重建。
-- 4. 保留 expires_at 列与 notification_* 表：到期提醒和通知渠道仍然在用。

PRAGMA defer_foreign_keys = true;

-- 1) 备份多标签分类（会被步骤 3 的 CASCADE 清空）
CREATE TABLE _domain_auto_categories_backup AS
  SELECT domain_id, category, created_at FROM domain_auto_categories;

-- 2) 删掉只服务于求购线索 / DNS 的子表
DROP TABLE IF EXISTS domain_leads;
DROP TABLE IF EXISTS dns_records_cache;

-- 2b) sync_runs 要留下：CSV 导入靠它记录每次导入的运行状态（见 shared/import-plan.ts）。
--     只把它指向 registrar_accounts 的外键摘掉，导入本来就不会写这一列。
CREATE TABLE sync_runs_new (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_message TEXT
);
INSERT INTO sync_runs_new (
  id, source, status, inserted_count, updated_count, skipped_count, error_count,
  started_at, finished_at, error_message
)
SELECT
  id, source, status, inserted_count, updated_count, skipped_count, error_count,
  started_at, finished_at, error_message
FROM sync_runs;
DROP TABLE sync_runs;
ALTER TABLE sync_runs_new RENAME TO sync_runs;

-- 3) 重建 domains：去掉 registrar_account_id 及其外键
CREATE TABLE domains_new (
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
  auto_category_confidence REAL NOT NULL DEFAULT 0
);

INSERT INTO domains_new (
  id, full_domain, normalized_domain, name, tld, category,
  is_featured, is_listed, public_price, public_price_currency, public_price_approved,
  notes, source, source_imported_at, expires_at, created_at, updated_at,
  description, auto_category, auto_subcategory, auto_category_confidence
)
SELECT
  id, full_domain, normalized_domain, name, tld, category,
  is_featured, is_listed, public_price, public_price_currency, public_price_approved,
  notes, source, source_imported_at, expires_at, created_at, updated_at,
  description, auto_category, auto_subcategory, auto_category_confidence
FROM domains;

DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;

-- 4) 灌回多标签分类
DELETE FROM domain_auto_categories;
INSERT INTO domain_auto_categories (domain_id, category, created_at)
  SELECT domain_id, category, created_at FROM _domain_auto_categories_backup;
DROP TABLE _domain_auto_categories_backup;

-- 5) 重建随表消失的索引
CREATE INDEX idx_domains_public_sort ON domains(is_listed, is_featured DESC, name, normalized_domain);
CREATE INDEX idx_domains_tld ON domains(tld, is_listed);
CREATE INDEX idx_domains_category ON domains(category, is_listed);
CREATE INDEX idx_domains_public_filter ON domains(is_listed, is_featured, tld, public_price);
CREATE INDEX idx_domains_public_version ON domains(is_listed, updated_at DESC);
CREATE INDEX idx_domains_auto_category ON domains(auto_category, is_listed);

-- 6) 重建随表消失的触发器（前台数据版本号，用于近实时刷新）
CREATE TRIGGER domains_public_version_insert AFTER INSERT ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
CREATE TRIGGER domains_public_version_update AFTER UPDATE ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
CREATE TRIGGER domains_public_version_delete AFTER DELETE ON domains BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;

-- 7) 现在已无表引用 registrar_accounts，可以安全删除
DROP TABLE IF EXISTS registrar_accounts;
