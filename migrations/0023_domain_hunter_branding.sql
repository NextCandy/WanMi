-- 将站点设置与当前公开品牌保持一致；联系方式等管理员数据保持不变。
UPDATE site_settings
SET site_name = 'DOMAIN HUNTER',
    site_description = '精选域名资产展示',
    logo_url = '/logo.svg',
    favicon_url = '/favicon.svg',
    accent_color = '#d8b638',
    display_density = 'compact',
    copyright_text = '@2026',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
