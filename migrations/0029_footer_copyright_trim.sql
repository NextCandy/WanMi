-- 页脚版权只保留「© 2026 UnUseDomain」，去掉「. All rights reserved.」后缀。
-- 用 REPLACE 而不是整句覆盖，管理员在后台改过前半段时不会被这次迁移抹掉。
UPDATE site_settings
SET copyright_text = TRIM(REPLACE(copyright_text, '. All rights reserved.', '')),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1 AND copyright_text LIKE '%All rights reserved%';
