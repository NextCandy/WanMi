-- 将早期默认珊瑚橙升级为本轮黑金视觉；仅匹配历史默认值，不覆盖管理员自定义主题色。
UPDATE site_settings
SET accent_color = '#d8b638', updated_at = CURRENT_TIMESTAMP
WHERE accent_color IN ('#f97316', '#e85d2a');
