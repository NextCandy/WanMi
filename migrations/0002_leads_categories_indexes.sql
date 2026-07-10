-- 0002: 求购线索、分类字典、公开查询复合索引、会话地理、站点简介
-- 幂等性：本文件由 wrangler d1 migrations 账本保证只执行一次；
-- 表/索引均使用 IF NOT EXISTS，可安全手动重放；ALTER TABLE ADD COLUMN
-- 为 SQLite 限制无法加 IF NOT EXISTS，重放前请先执行文件末尾的回滚 SQL。
PRAGMA foreign_keys = ON;

-- 1) Make Offer 求购线索
CREATE TABLE IF NOT EXISTS domain_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL,
  offer_amount TEXT,
  currency TEXT,
  contact TEXT NOT NULL,
  message TEXT,
  ip_hash TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_domain_leads_created ON domain_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_leads_domain ON domain_leads(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_leads_status ON domain_leads(status, created_at DESC);

-- 2) 分类字典（支持后台"新建标签"与分类管理页）
CREATE TABLE IF NOT EXISTS domain_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 吸收既有自由文本分类，幂等
INSERT OR IGNORE INTO domain_categories (name)
  SELECT DISTINCT category FROM domains WHERE category IS NOT NULL AND category != '';

-- 3) 公开列表复合索引（is_listed + is_featured + tld + public_price）
CREATE INDEX IF NOT EXISTS idx_domains_public_filter ON domains(is_listed, is_featured, tld, public_price);
CREATE INDEX IF NOT EXISTS idx_marketplace_domain_metrics ON domain_marketplace_listings(domain_id, views, date_added_at);

-- 4) 会话地理（CF-IPCountry）
ALTER TABLE admin_sessions ADD COLUMN ip_country TEXT;

-- 5) 站点品牌简介（前台 Hero 区 Bio）
ALTER TABLE site_settings ADD COLUMN site_bio TEXT;

-- ============ 回滚 SQL（手动执行） ============
-- DROP INDEX IF EXISTS idx_domain_leads_created;
-- DROP INDEX IF EXISTS idx_domain_leads_domain;
-- DROP INDEX IF EXISTS idx_domain_leads_status;
-- DROP TABLE IF EXISTS domain_leads;
-- DROP TABLE IF EXISTS domain_categories;
-- DROP INDEX IF EXISTS idx_domains_public_filter;
-- DROP INDEX IF EXISTS idx_marketplace_domain_metrics;
-- ALTER TABLE admin_sessions DROP COLUMN ip_country;
-- ALTER TABLE site_settings DROP COLUMN site_bio;
