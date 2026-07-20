-- 品牌统一：中文产品名「玩米」、英文产品名「WanMi」。
-- 生产 site_settings 仍残留历史品牌 DOMAIN HUNTER（前台 title/页首/页脚可见），
-- 仅精确匹配历史品牌值，不覆盖管理员设置的其他内容。
UPDATE site_settings
SET site_name = 'WanMi', updated_at = CURRENT_TIMESTAMP
WHERE site_name IN ('DOMAIN HUNTER', 'DomainHunter', 'domain hunter');

UPDATE site_settings
SET copyright_text = '© WanMi · 玩米', updated_at = CURRENT_TIMESTAMP
WHERE copyright_text IN ('@ DOMAIN HUNTER', '© DOMAIN HUNTER', '@DOMAIN HUNTER');
