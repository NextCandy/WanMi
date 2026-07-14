-- 独立通知渠道配置。敏感字段以 AES-GCM 密文写入 config JSON。
CREATE TABLE IF NOT EXISTS notify_channels (
  channel TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  config TEXT NOT NULL DEFAULT '{}',
  last_test TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'email', email_enabled, json_object('to', COALESCE(email_recipient, ''), 'from', '') FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'telegram', telegram_enabled, json_object('chat_id', COALESCE(telegram_chat_id, '')) FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'bark', bark_enabled, json_object('server_url', 'https://api.day.app', 'secret_encrypted', bark_device_key_encrypted, 'secret_iv', bark_device_key_iv) FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'serverchan', serverchan_enabled, json_object('secret_encrypted', serverchan_key_encrypted, 'secret_iv', serverchan_key_iv) FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'wecom', wecom_enabled, json_object('secret_encrypted', wecom_webhook_encrypted, 'secret_iv', wecom_webhook_iv) FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'feishu', feishu_enabled, json_object('secret_encrypted', feishu_webhook_encrypted, 'secret_iv', feishu_webhook_iv) FROM notification_settings WHERE id = 1;
INSERT OR IGNORE INTO notify_channels (channel, enabled, config)
SELECT 'discord', discord_enabled, json_object('secret_encrypted', discord_webhook_encrypted, 'secret_iv', discord_webhook_iv) FROM notification_settings WHERE id = 1;

CREATE INDEX IF NOT EXISTS idx_notify_channels_enabled ON notify_channels(enabled, channel);
