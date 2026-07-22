-- 前台文案已全部英文化，剩下的中文只来自库内简介（全站仅两条）。改成英文后
-- 前台不再出现汉字，中文字体子集就完全不必进前台首屏。
--
-- 用当前值做条件，只改这两条原始内容；管理员若已在后台改过，条件不匹配便跳过，
-- 不会覆盖人工编辑。简介本身仍是后台可随时编辑的普通字段。
UPDATE domains
SET description = 'Model, dream, star — the three readings behind MX.',
    updated_at = CURRENT_TIMESTAMP
WHERE full_domain = 'mx.ooo' AND description = '模型、梦想、明星';

UPDATE domains
SET description = 'Domain sales.',
    updated_at = CURRENT_TIMESTAMP
WHERE full_domain = 'namesale.cn' AND description = '域名售卖';
