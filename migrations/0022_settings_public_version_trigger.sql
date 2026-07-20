-- 站点设置更新也参与公开数据版本：边缘缓存键携带 version，
-- 后台改设置后公开接口缓存立即失效（与 domains 触发器同一 version 计数器）。
CREATE TRIGGER IF NOT EXISTS site_settings_public_version_update AFTER UPDATE ON site_settings BEGIN
  UPDATE public_data_version SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
END;
