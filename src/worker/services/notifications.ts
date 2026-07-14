import { decryptCredentials } from "../security/crypto";
import type { Env } from "../types";

export type NotificationChannel = "email" | "telegram" | "bark" | "serverchan" | "wecom" | "feishu" | "discord";
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "email", "telegram", "bark", "serverchan", "wecom", "feishu", "discord",
];

export interface NotificationSettingsRow {
  email_recipient: string | null;
  telegram_chat_id: string | null;
  bark_device_key_encrypted: string | null;
  bark_device_key_iv: string | null;
  serverchan_key_encrypted: string | null;
  serverchan_key_iv: string | null;
  wecom_webhook_encrypted: string | null;
  wecom_webhook_iv: string | null;
  feishu_webhook_encrypted: string | null;
  feishu_webhook_iv: string | null;
  discord_webhook_encrypted: string | null;
  discord_webhook_iv: string | null;
}

async function decryptSecret(
  env: Env,
  encrypted: string | null,
  iv: string | null,
  field: string,
  label: string,
): Promise<string> {
  if (!encrypted || !iv) throw new Error(`${label} 未配置`);
  const credentials = await decryptCredentials(encrypted, iv, env.CREDENTIALS_ENCRYPTION_KEY);
  const value = credentials[field];
  if (!value) throw new Error(`${label} 配置无效`);
  return value;
}

export interface NotifyChannelRow {
  channel: NotificationChannel;
  enabled: number;
  config: string;
  last_test: string | null;
}

export type NotificationConfig = Record<string, string | undefined>;

export function parseNotificationConfig(value: string): NotificationConfig {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as NotificationConfig : {};
  } catch {
    return {};
  }
}

export function buildBarkPushUrl(value: string, title: string, content: string): string {
  const configured = value.trim();
  const suffix = `${encodeURIComponent(title)}/${encodeURIComponent(content)}`;
  if (/^https:\/\//i.test(configured)) {
    const endpoint = new URL(configured);
    if (endpoint.username || endpoint.password || !endpoint.pathname.split("/").some(Boolean)) {
      throw new Error("Bark 推送地址格式无效");
    }
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${suffix}`;
    return endpoint.toString();
  }
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(configured)) {
    throw new Error("Bark Device Key 格式无效");
  }
  return `https://api.day.app/${encodeURIComponent(configured)}/${suffix}`;
}

export function buildSplitBarkPushUrl(serverUrl: string, deviceKey: string, title: string, content: string): string {
  const server = new URL(serverUrl.trim().replace(/\/+$/, ""));
  if (server.protocol !== "https:" || server.username || server.password || server.search || server.hash) {
    throw new Error("Bark 服务地址必须是安全的 HTTPS 地址");
  }
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(deviceKey.trim())) throw new Error("Bark Device Key 格式无效");
  server.pathname = `${server.pathname.replace(/\/+$/, "")}/${encodeURIComponent(deviceKey.trim())}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`;
  return server.toString();
}

async function channelSecret(env: Env, config: NotificationConfig, field: string, label: string): Promise<string> {
  const encrypted = config.secret_encrypted;
  const iv = config.secret_iv;
  if (!encrypted || !iv) throw new Error(`${label} 未配置`);
  const credentials = await decryptCredentials(encrypted, iv, env.CREDENTIALS_ENCRYPTION_KEY);
  const value = credentials[field];
  if (!value) throw new Error(`${label} 配置无效`);
  return value;
}

export async function sendChannelNotification(
  env: Env,
  row: NotifyChannelRow,
  message: { title: string; content: string },
): Promise<{ providerMessageId: string | null }> {
  const channel = row.channel;
  const config = parseNotificationConfig(row.config);
  const { title, content } = message;
  if (channel === "email") {
    if (!env.RESEND_API_KEY || !config.from || !config.to) throw new Error("Email 未配置 Resend Secret、发件人或收件人");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.from, to: [config.to], subject: title, text: content }) });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(`Resend 发送失败：${body.message ?? response.status}`);
    return { providerMessageId: body.id ?? null };
  }
  if (channel === "telegram") {
    const token = await channelSecret(env, config, "bot_token", "Telegram Bot Token");
    if (!config.chat_id) throw new Error("Telegram Chat ID 未配置");
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: config.chat_id, text: `${title}\n${content}` }) });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!response.ok || !body.ok) throw new Error(`Telegram 发送失败：${body.description ?? response.status}`);
    return { providerMessageId: body.result?.message_id ? String(body.result.message_id) : null };
  }
  if (channel === "bark") {
    const configured = await channelSecret(env, config, "device_key", "Bark Device Key");
    let server = config.server_url || "https://api.day.app";
    let deviceKey = configured;
    if (/^https:\/\//i.test(configured)) {
      const legacy = new URL(configured);
      const parts = legacy.pathname.split("/").filter(Boolean);
      deviceKey = parts.pop() ?? "";
      legacy.pathname = `/${parts.join("/")}`;
      server = legacy.toString().replace(/\/$/, "");
    }
    const response = await fetch(buildSplitBarkPushUrl(server, deviceKey, title, content));
    const body = await response.json().catch(() => ({})) as { code?: number; message?: string };
    if (!response.ok || body.code !== 200) throw new Error(`Bark 发送失败：${body.message ?? response.status}`);
    return { providerMessageId: null };
  }
  if (channel === "serverchan") {
    const key = await channelSecret(env, config, "send_key", "Server 酱 SendKey");
    const response = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, desp: content }) });
    const body = await response.json().catch(() => ({})) as { code?: number; message?: string; data?: { pushid?: string } };
    if (!response.ok || body.code !== 0) throw new Error(`Server 酱发送失败：${body.message ?? response.status}`);
    return { providerMessageId: body.data?.pushid ?? null };
  }
  const webhook = await channelSecret(env, config, "webhook_url", `${channel} Webhook`);
  const body = channel === "wecom" ? { msgtype: "text", text: { content: `${title}\n${content}` } } : channel === "feishu" ? { msg_type: "text", content: { text: `${title}\n${content}` } } : { content: `**${title}**\n${content}` };
  const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as { errcode?: number; code?: number; StatusCode?: number; errmsg?: string; msg?: string; message?: string };
  const ok = channel === "wecom" ? response.ok && result.errcode === 0 : channel === "feishu" ? response.ok && (result.code === 0 || result.StatusCode === 0) : response.ok;
  if (!ok) throw new Error(`${channel} 发送失败：${result.errmsg ?? result.msg ?? result.message ?? response.status}`);
  return { providerMessageId: null };
}

export async function loadEnabledNotificationChannels(env: Env): Promise<NotifyChannelRow[]> {
  const result = await env.DB.prepare("SELECT channel, enabled, config, last_test FROM notify_channels WHERE enabled = 1 ORDER BY channel").all<NotifyChannelRow>();
  return result.results;
}

export async function sendNotification(
  env: Env,
  channel: NotificationChannel,
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

  if (channel === "bark") {
    const key = await decryptSecret(env, settings.bark_device_key_encrypted, settings.bark_device_key_iv, "deviceKey", "Bark 设备密钥");
    const response = await fetch(buildBarkPushUrl(key, title, content));
    const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!response.ok || body.code !== 200) throw new Error(`Bark 发送失败：${body.message ?? response.status}`);
    return { providerMessageId: null };
  }

  if (channel === "serverchan") {
    const key = await decryptSecret(env, settings.serverchan_key_encrypted, settings.serverchan_key_iv, "sendKey", "Server 酱 SendKey");
    const response = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, desp: content }),
    });
    const body = (await response.json().catch(() => ({}))) as { code?: number; message?: string; data?: { pushid?: string } };
    if (!response.ok || body.code !== 0) throw new Error(`Server 酱发送失败：${body.message ?? response.status}`);
    return { providerMessageId: body.data?.pushid ?? null };
  }

  if (channel === "wecom") {
    const webhook = await decryptSecret(env, settings.wecom_webhook_encrypted, settings.wecom_webhook_iv, "webhookUrl", "企业微信 Webhook");
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content: `${title}\n${content}` } }),
    });
    const body = (await response.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
    if (!response.ok || body.errcode !== 0) throw new Error(`企业微信发送失败：${body.errmsg ?? response.status}`);
    return { providerMessageId: null };
  }

  if (channel === "feishu") {
    const webhook = await decryptSecret(env, settings.feishu_webhook_encrypted, settings.feishu_webhook_iv, "webhookUrl", "飞书 Webhook");
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: `${title}\n${content}` } }),
    });
    const body = (await response.json().catch(() => ({}))) as { code?: number; StatusCode?: number; msg?: string };
    const success = response.ok && (body.code === 0 || body.StatusCode === 0);
    if (!success) throw new Error(`飞书发送失败：${body.msg ?? response.status}`);
    return { providerMessageId: null };
  }

  // discord
  const webhook = await decryptSecret(env, settings.discord_webhook_encrypted, settings.discord_webhook_iv, "webhookUrl", "Discord Webhook");
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `**${title}**\n${content}` }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Discord 发送失败：${body.message ?? response.status}`);
  }
  return { providerMessageId: null };
}

export function sendTestNotification(
  env: Env,
  channel: NotificationChannel,
  settings: NotificationSettingsRow,
): Promise<{ providerMessageId: string | null }> {
  return sendNotification(env, channel, settings, {
    title: "玩米通知测试",
    content: "这是一条由玩米后台真实发送的测试通知。",
  });
}

/** 从 notification_settings 完整行推导已启用渠道 */
export function enabledChannels(row: Record<string, unknown>): NotificationChannel[] {
  const flags: Array<[NotificationChannel, string]> = [
    ["email", "email_enabled"],
    ["telegram", "telegram_enabled"],
    ["bark", "bark_enabled"],
    ["serverchan", "serverchan_enabled"],
    ["wecom", "wecom_enabled"],
    ["feishu", "feishu_enabled"],
    ["discord", "discord_enabled"],
  ];
  return flags.filter(([, key]) => row[key] === 1).map(([channel]) => channel);
}
