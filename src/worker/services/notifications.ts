import { decryptCredentials } from "../security/crypto";
import type { Env } from "../types";

interface NotificationSettingsRow {
  email_recipient: string | null;
  telegram_chat_id: string | null;
  bark_device_key_encrypted: string | null;
  bark_device_key_iv: string | null;
}

export async function sendNotification(
  env: Env,
  channel: "email" | "telegram" | "bark",
  settings: NotificationSettingsRow,
  message: { title: string; content: string },
): Promise<{ providerMessageId: string | null }> {
  const { title, content } = message;
  if (channel === "email") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !settings.email_recipient) {
      throw new Error("Email 未配置 RESEND_API_KEY、EMAIL_FROM 或收件人");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [settings.email_recipient], subject: title, text: content }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) throw new Error(`Resend 发送失败：${response.status} ${body.message ?? "未知错误"}`);
    return { providerMessageId: body.id ?? null };
  }
  if (channel === "telegram") {
    if (!env.TELEGRAM_BOT_TOKEN || !settings.telegram_chat_id) {
      throw new Error("Telegram 未配置 Bot Token 或 Chat ID");
    }
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegram_chat_id, text: `${title}\n${content}` }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!response.ok || !body.ok) throw new Error(`Telegram 发送失败：${body.description ?? response.status}`);
    return { providerMessageId: body.result?.message_id ? String(body.result.message_id) : null };
  }
  if (!settings.bark_device_key_encrypted || !settings.bark_device_key_iv) {
    throw new Error("Bark 未配置设备密钥");
  }
  const credentials = await decryptCredentials(
    settings.bark_device_key_encrypted,
    settings.bark_device_key_iv,
    env.CREDENTIALS_ENCRYPTION_KEY,
  );
  const key = credentials.deviceKey;
  if (!key) throw new Error("Bark 设备密钥无效");
  const response = await fetch(
    `https://api.day.app/${encodeURIComponent(key)}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`,
  );
  const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
  if (!response.ok || body.code !== 200) throw new Error(`Bark 发送失败：${body.message ?? response.status}`);
  return { providerMessageId: null };
}

export function sendTestNotification(
  env: Env,
  channel: "email" | "telegram" | "bark",
  settings: NotificationSettingsRow,
): Promise<{ providerMessageId: string | null }> {
  return sendNotification(env, channel, settings, {
    title: "WanMi 通知测试",
    content: "这是一条由 WanMi 后台真实发送的测试通知。",
  });
}
