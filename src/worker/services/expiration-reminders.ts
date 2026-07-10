import { writeOperationLog } from "../http";
import { sendNotification } from "./notifications";
import type { Env } from "../types";

interface SettingsRow {
  reminder_days_json: string;
  email_enabled: number;
  telegram_enabled: number;
  bark_enabled: number;
  email_recipient: string | null;
  telegram_chat_id: string | null;
  bark_device_key_encrypted: string | null;
  bark_device_key_iv: string | null;
  timezone: string;
}

interface ExpiringDomainRow {
  id: number;
  normalized_domain: string;
  expires_at: string;
  days_remaining: number;
}

export async function runExpirationReminders(env: Env): Promise<void> {
  const settings = await env.DB.prepare("SELECT * FROM notification_settings WHERE id = 1").first<SettingsRow>();
  if (!settings) throw new Error("通知设置尚未初始化");
  const parsedDays: unknown = JSON.parse(settings.reminder_days_json);
  const days = Array.isArray(parsedDays)
    ? parsedDays.filter((value): value is number => Number.isInteger(value) && value > 0 && value <= 365)
    : [];
  if (days.length === 0) return;
  const placeholders = days.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT id, normalized_domain, expires_at,
      CAST(julianday(date(expires_at)) - julianday(date('now')) AS INTEGER) AS days_remaining
     FROM domains
     WHERE expires_at IS NOT NULL
       AND CAST(julianday(date(expires_at)) - julianday(date('now')) AS INTEGER) IN (${placeholders})`,
  )
    .bind(...days)
    .all<ExpiringDomainRow>();
  const channels: Array<"email" | "telegram" | "bark"> = [];
  if (settings.email_enabled === 1) channels.push("email");
  if (settings.telegram_enabled === 1) channels.push("telegram");
  if (settings.bark_enabled === 1) channels.push("bark");
  const scheduledDate = new Date().toISOString().slice(0, 10);

  for (const domain of result.results) {
    for (const channel of channels) {
      const deliveryId = crypto.randomUUID();
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO notification_deliveries (
          id, domain_id, channel, reminder_days, scheduled_date, status
        ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      )
        .bind(deliveryId, domain.id, channel, domain.days_remaining, scheduledDate)
        .run();
      if (inserted.meta.changes === 0) continue;
      try {
        const response = await sendNotification(env, channel, settings, {
          title: "WanMi 域名到期提醒",
          content: `${domain.normalized_domain} 将在 ${domain.days_remaining} 天后到期。`,
        });
        await env.DB.prepare(
          "UPDATE notification_deliveries SET status = 'sent', provider_message_id = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
          .bind(response.providerMessageId, deliveryId)
          .run();
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "通知发送失败";
        await env.DB.prepare(
          "UPDATE notification_deliveries SET status = 'failed', error_message = ? WHERE id = ?",
        )
          .bind(message, deliveryId)
          .run();
        await writeOperationLog(env.DB, {
          level: "error",
          action: "notifications.expiration",
          resourceType: "domain",
          resourceId: domain.id,
          message: `${channel} 到期提醒发送失败`,
          details: { channel, daysRemaining: domain.days_remaining, error: message },
          success: false,
        });
      }
    }
  }
}
