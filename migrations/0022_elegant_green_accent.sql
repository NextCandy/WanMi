-- 雅致绿金主题：将历史各轮默认强调色（珊瑚橙/黑金/暖金）归一为墨绿品牌色。
-- 仅匹配历史默认值，不覆盖管理员真正自定义的主题色（与 0014 同一惯例）。
UPDATE site_settings
SET accent_color = '#133429', updated_at = CURRENT_TIMESTAMP
WHERE accent_color IN ('#f97316', '#e85d2a', '#d8b638', '#b89530', '#c4a242');
