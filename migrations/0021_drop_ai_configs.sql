-- 移除 AI 简介功能：后台不再提供 AI 配置模块，域名简介改为纯手动维护。
-- ai_configs 由 0018 创建（0019/0020 调整过模型名），随功能一并删除；
-- 表内是管理员保存的提供商配置与加密 API Key，删除不影响 domains.description 已有数据。
DROP TABLE IF EXISTS ai_configs;
