-- 修复已部署库中错误的 AI 模型名（deepseek-v4-flash / deepseek-v4-flash-free 均非真实模型名）
-- DeepSeek 官方真实模型为 deepseek-chat (V3) 和 deepseek-reasoner (R1)
-- 此迁移幂等，多次执行无副作用
UPDATE ai_configs
SET model = 'deepseek-chat'
WHERE model IN ('deepseek-v4-flash', 'deepseek-v4-flash-free');
