-- 多 AI 配置用于生成域名简介；API Key 使用现有 AES-GCM 密钥加密后写入。
CREATE TABLE IF NOT EXISTS ai_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('deepseek', 'openai_compatible')),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  api_key_encrypted TEXT,
  api_key_iv TEXT,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (api_key_encrypted IS NULL AND api_key_iv IS NULL)
    OR (api_key_encrypted IS NOT NULL AND api_key_iv IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_configs_single_active
ON ai_configs(is_active) WHERE is_active = 1;

INSERT OR IGNORE INTO ai_configs (
  id, name, provider, base_url, model, prompt_template, is_active
) VALUES (
  'deepseek-default',
  'DeepSeek 默认配置',
  'deepseek',
  'https://api.deepseek.com',
  'deepseek-chat',
  '你是中文域名品牌文案编辑。请为域名「{domain}」撰写一段 40-80 字的中文简介。后缀：{tld}；主体长度：{length}；类型：{type}。突出可能的品牌联想与适用方向，不虚构流量、收入、交易、报价或所有权信息。只输出简介正文，不要标题、引号或解释。',
  1
);
