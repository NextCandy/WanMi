import { Hono } from "hono";

import { notificationPatchSchema, settingsPatchSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import { encryptCredentials } from "../../security/crypto";
import {
  NOTIFICATION_CHANNELS,
  sendTestNotification,
  type NotificationChannel,
  type NotificationSettingsRow,
} from "../../services/notifications";
import type { AppBindings } from "../../types";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/x-icon": "ico",
};
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const settingsRoutes = new Hono<AppBindings>();

settingsRoutes.get("/settings", async (c) => {
  const settings = await c.env.DB.prepare("SELECT * FROM site_settings WHERE id = 1").first();
  return ok(c, settings);
});

settingsRoutes.patch("/settings", async (c) => {
  const parsed = settingsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_SETTINGS", "站点设置无效", parsed.error.issues);
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    fields.push(`${key} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : value ?? null);
  }
  if (fields.length === 0) return fail(c, 422, "NO_CHANGES", "没有可保存的设置");
  await c.env.DB.prepare(`UPDATE site_settings SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
    .bind(...values)
    .run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "settings.update",
    resourceType: "site_settings",
    resourceId: 1,
    message: "更新站点设置",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { saved: true });
});

settingsRoutes.post("/uploads", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  const target = form.target;
  if (!(file instanceof File)) return fail(c, 422, "IMAGE_REQUIRED", "请选择图片文件");
  if (typeof target !== "string" || !["logo", "favicon", "wechatQr"].includes(target)) {
    return fail(c, 422, "UPLOAD_TARGET_INVALID", "上传目标无效");
  }
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return fail(c, 422, "IMAGE_TYPE_INVALID", "仅支持 PNG、JPEG、WebP 或 ICO");
  if (file.size > MAX_IMAGE_BYTES) return fail(c, 413, "IMAGE_TOO_LARGE", "图片不能超过 2 MB");
  const key = `site/${target}-${crypto.randomUUID()}.${extension}`;
  await c.env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  const url = `/uploads/${key}`;
  const column = target === "logo" ? "logo_url" : target === "favicon" ? "favicon_url" : "wechat_qr_url";
  await c.env.DB.prepare(`UPDATE site_settings SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
    .bind(url)
    .run();
  return ok(c, { key, url }, 201);
});

settingsRoutes.delete("/uploads/*", async (c) => {
  const key = decodeURIComponent(c.req.path.split("/uploads/")[1] ?? "");
  if (!key.startsWith("site/") || key.includes("..")) return fail(c, 422, "UPLOAD_KEY_INVALID", "文件键无效");
  await c.env.UPLOADS.delete(key);
  const url = `/uploads/${key}`;
  await c.env.DB.prepare(
    `UPDATE site_settings SET
      logo_url = CASE WHEN logo_url = ? THEN NULL ELSE logo_url END,
      favicon_url = CASE WHEN favicon_url = ? THEN NULL ELSE favicon_url END,
      wechat_qr_url = CASE WHEN wechat_qr_url = ? THEN NULL ELSE wechat_qr_url END,
      updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
  )
    .bind(url, url, url)
    .run();
  return ok(c, { deleted: true });
});

settingsRoutes.get("/notifications", async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT reminder_days_json, email_enabled, telegram_enabled, bark_enabled,
      serverchan_enabled, wecom_enabled, feishu_enabled, discord_enabled,
      email_recipient, telegram_chat_id, timezone,
      CASE WHEN bark_device_key_encrypted IS NOT NULL THEN 1 ELSE 0 END AS bark_configured,
      CASE WHEN serverchan_key_encrypted IS NOT NULL THEN 1 ELSE 0 END AS serverchan_configured,
      CASE WHEN wecom_webhook_encrypted IS NOT NULL THEN 1 ELSE 0 END AS wecom_configured,
      CASE WHEN feishu_webhook_encrypted IS NOT NULL THEN 1 ELSE 0 END AS feishu_configured,
      CASE WHEN discord_webhook_encrypted IS NOT NULL THEN 1 ELSE 0 END AS discord_configured
     FROM notification_settings WHERE id = 1`,
  ).first();
  return ok(c, settings);
});

// 加密入库的渠道密钥：patch 字段 → [加密列前缀, 凭据字段名]
const SECRET_FIELDS: Array<[string, string, string]> = [
  ["bark_device_key", "bark_device_key", "deviceKey"],
  ["serverchan_key", "serverchan_key", "sendKey"],
  ["wecom_webhook", "wecom_webhook", "webhookUrl"],
  ["feishu_webhook", "feishu_webhook", "webhookUrl"],
  ["discord_webhook", "discord_webhook", "webhookUrl"],
];

settingsRoutes.patch("/notifications", async (c) => {
  const parsed = notificationPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_NOTIFICATION_SETTINGS", "通知设置无效", parsed.error.issues);
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  const secretKeys = new Set(SECRET_FIELDS.map(([key]) => key));
  for (const [key, value] of Object.entries(parsed.data)) {
    if (secretKeys.has(key)) continue;
    const column = key === "reminder_days" ? "reminder_days_json" : key;
    fields.push(`${column} = ?`);
    values.push(Array.isArray(value) ? JSON.stringify([...new Set(value)].sort((a, b) => b - a)) : typeof value === "boolean" ? (value ? 1 : 0) : value ?? null);
  }
  for (const [patchKey, columnPrefix, credentialField] of SECRET_FIELDS) {
    const secret = (parsed.data as Record<string, unknown>)[patchKey];
    if (typeof secret !== "string" || !secret) continue;
    const encrypted = await encryptCredentials({ [credentialField]: secret }, c.env.CREDENTIALS_ENCRYPTION_KEY);
    fields.push(`${columnPrefix}_encrypted = ?`, `${columnPrefix}_iv = ?`);
    values.push(encrypted.encrypted, encrypted.iv);
  }
  if (fields.length === 0) return fail(c, 422, "NO_CHANGES", "没有可保存的通知设置");
  await c.env.DB.prepare(`UPDATE notification_settings SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
    .bind(...values)
    .run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "notifications.update",
    resourceType: "notification_settings",
    resourceId: 1,
    message: "更新到期提醒设置",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { saved: true });
});

settingsRoutes.post("/notifications/test", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { channel?: unknown } | null;
  if (!body || !NOTIFICATION_CHANNELS.includes(String(body.channel) as NotificationChannel)) {
    return fail(c, 422, "CHANNEL_INVALID", "通知渠道无效");
  }
  const settings = await c.env.DB.prepare("SELECT * FROM notification_settings WHERE id = 1").first<NotificationSettingsRow>();
  if (!settings) return fail(c, 503, "SETTINGS_UNAVAILABLE", "通知设置尚未初始化");
  const channel = body.channel as NotificationChannel;
  const user = c.get("authUser");
  try {
    const result = await sendTestNotification(c.env, channel, settings);
    await writeOperationLog(c.env.DB, {
      action: "notifications.test",
      resourceType: "notification",
      message: `${channel} 测试通知发送成功`,
      details: { channel, providerMessageId: result.providerMessageId },
      actorUserId: user.id,
      success: true,
    });
    return ok(c, { sent: true, channel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "通知发送失败";
    await writeOperationLog(c.env.DB, {
      level: "error",
      action: "notifications.test",
      resourceType: "notification",
      message,
      details: { channel },
      actorUserId: user.id,
      success: false,
    });
    return fail(c, 502, "NOTIFICATION_FAILED", message);
  }
});
