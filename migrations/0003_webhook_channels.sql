-- 0003: Webhook 通知渠道（Server 酱 / 企业微信机器人 / 飞书 / Discord）
-- 幂等性：由 wrangler d1 migrations 账本保证只执行一次；
-- ALTER TABLE ADD COLUMN 无法加 IF NOT EXISTS，重放前请先执行文件末尾回滚 SQL。
PRAGMA foreign_keys = ON;

-- 密钥/Webhook URL 一律 AES-GCM 加密存储，与 Bark 设备密钥同策略
ALTER TABLE notification_settings ADD COLUMN serverchan_enabled INTEGER NOT NULL DEFAULT 0 CHECK (serverchan_enabled IN (0, 1));
ALTER TABLE notification_settings ADD COLUMN serverchan_key_encrypted TEXT;
ALTER TABLE notification_settings ADD COLUMN serverchan_key_iv TEXT;
ALTER TABLE notification_settings ADD COLUMN wecom_enabled INTEGER NOT NULL DEFAULT 0 CHECK (wecom_enabled IN (0, 1));
ALTER TABLE notification_settings ADD COLUMN wecom_webhook_encrypted TEXT;
ALTER TABLE notification_settings ADD COLUMN wecom_webhook_iv TEXT;
ALTER TABLE notification_settings ADD COLUMN feishu_enabled INTEGER NOT NULL DEFAULT 0 CHECK (feishu_enabled IN (0, 1));
ALTER TABLE notification_settings ADD COLUMN feishu_webhook_encrypted TEXT;
ALTER TABLE notification_settings ADD COLUMN feishu_webhook_iv TEXT;
ALTER TABLE notification_settings ADD COLUMN discord_enabled INTEGER NOT NULL DEFAULT 0 CHECK (discord_enabled IN (0, 1));
ALTER TABLE notification_settings ADD COLUMN discord_webhook_encrypted TEXT;
ALTER TABLE notification_settings ADD COLUMN discord_webhook_iv TEXT;

-- ============ 回滚 SQL（手动执行） ============
-- ALTER TABLE notification_settings DROP COLUMN serverchan_enabled;
-- ALTER TABLE notification_settings DROP COLUMN serverchan_key_encrypted;
-- ALTER TABLE notification_settings DROP COLUMN serverchan_key_iv;
-- ALTER TABLE notification_settings DROP COLUMN wecom_enabled;
-- ALTER TABLE notification_settings DROP COLUMN wecom_webhook_encrypted;
-- ALTER TABLE notification_settings DROP COLUMN wecom_webhook_iv;
-- ALTER TABLE notification_settings DROP COLUMN feishu_enabled;
-- ALTER TABLE notification_settings DROP COLUMN feishu_webhook_encrypted;
-- ALTER TABLE notification_settings DROP COLUMN feishu_webhook_iv;
-- ALTER TABLE notification_settings DROP COLUMN discord_enabled;
-- ALTER TABLE notification_settings DROP COLUMN discord_webhook_encrypted;
-- ALTER TABLE notification_settings DROP COLUMN discord_webhook_iv;
