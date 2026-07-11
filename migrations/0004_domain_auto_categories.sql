-- 0004: 自动分类多标签；保留 domains.category 作为人工单分类
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS domain_auto_categories (
  domain_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (domain_id, category),
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_auto_categories_category
  ON domain_auto_categories(category, domain_id);
