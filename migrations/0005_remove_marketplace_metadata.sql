-- 0005: 玩米只保留域名资产本身，不再保留售卖平台元数据
PRAGMA foreign_keys = ON;

DELETE FROM domain_marketplace_listings;
DELETE FROM domain_import_staging;

UPDATE domains SET
  category = NULL,
  is_featured = 0,
  is_listed = 1,
  public_price = NULL,
  public_price_currency = NULL,
  public_price_approved = 0,
  notes = NULL,
  source = 'domain-list',
  source_imported_at = NULL,
  updated_at = CURRENT_TIMESTAMP;
