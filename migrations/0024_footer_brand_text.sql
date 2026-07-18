-- 页脚改为无年份的品牌署名，并同步后台站点设置。
UPDATE site_settings
SET copyright_text = '@ DOMAIN HUNTER',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
