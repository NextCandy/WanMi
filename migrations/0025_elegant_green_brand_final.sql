-- 雅致绿金主题的最终品牌与主题色收敛。
-- 背景：0023_domain_hunter_branding / 0024_footer_brand_text（darwin 线）与
-- 0022_elegant_green_accent / 0023_unify_brand_names（win32 线）在两台机器上的
-- 应用顺序不同：远程按提交时序（DOMAIN HUNTER 线先、绿金线后）已收敛为绿金；
-- 本地合并后 0023_domain_hunter / 0024_footer 会晚于绿金迁移执行、把品牌改回
-- DOMAIN HUNTER + 黑金。本迁移排在所有品牌迁移之后，保证两端最终态一致。
-- 幂等：条件匹配历史品牌/历史默认色，不覆盖管理员自定义内容。
UPDATE site_settings
SET site_name = 'WanMi', updated_at = CURRENT_TIMESTAMP
WHERE site_name IN ('DOMAIN HUNTER', 'DomainHunter', 'domain hunter');

UPDATE site_settings
SET copyright_text = '© WanMi · 玩米', updated_at = CURRENT_TIMESTAMP
WHERE copyright_text IN ('@ DOMAIN HUNTER', '© DOMAIN HUNTER', '@DOMAIN HUNTER', '@2026');

UPDATE site_settings
SET accent_color = '#133429', updated_at = CURRENT_TIMESTAMP
WHERE accent_color IN ('#f97316', '#e85d2a', '#d8b638', '#b89530', '#c4a242', '#d4b252', '#2fbf9a', '#5a3e2b');
