import { afterEach, describe, expect, it, vi } from "vitest";

import { encryptCredentials } from "../../src/worker/security/crypto";
import { buildBarkPushUrl, sendChannelNotification, type NotificationChannel, type NotifyChannelRow } from "../../src/worker/services/notifications";
import type { Env } from "../../src/worker/types";

const encryptionKey = Buffer.alloc(32, 11).toString("base64");
const env = { CREDENTIALS_ENCRYPTION_KEY: encryptionKey, RESEND_API_KEY: "resend-secret" } as Env;

async function channel(channel: NotificationChannel, config: Record<string, string>, secret?: [string, string]): Promise<NotifyChannelRow> {
  if (secret) {
    const encrypted = await encryptCredentials({ [secret[0]]: secret[1] }, encryptionKey);
    config.secret_encrypted = encrypted.encrypted;
    config.secret_iv = encrypted.iv;
  }
  return { channel, enabled: 1, config: JSON.stringify(config), last_test: null };
}

afterEach(() => vi.restoreAllMocks());

describe("通知渠道", () => {
  it("Bark Device Key 使用官方服务地址", () => {
    expect(buildBarkPushUrl("device_Key-123", "测试 标题", "内容/正文"))
      .toBe("https://api.day.app/device_Key-123/%E6%B5%8B%E8%AF%95%20%E6%A0%87%E9%A2%98/%E5%86%85%E5%AE%B9%2F%E6%AD%A3%E6%96%87");
  });

  it("Bark 完整自建推送地址保留服务器和设备 Key", () => {
    const url = buildBarkPushUrl("https://bark.example.com/device-key/", "玩米通知", "同步完成");
    expect(url).toBe("https://bark.example.com/device-key/%E7%8E%A9%E7%B1%B3%E9%80%9A%E7%9F%A5/%E5%90%8C%E6%AD%A5%E5%AE%8C%E6%88%90");
  });

  it("Bark 兼容迁移前密文中的 deviceKey 字段", async () => {
    const encrypted = await encryptCredentials({ deviceKey: "legacy-key" }, encryptionKey);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 200 }), { status: 200 }));
    await sendChannelNotification(env, { channel: "bark", enabled: 1, config: JSON.stringify({ server_url: "https://api.day.app", secret_encrypted: encrypted.encrypted, secret_iv: encrypted.iv }), last_test: null }, { title: "标题", content: "正文" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.day.app/legacy-key/%E6%A0%87%E9%A2%98/%E6%AD%A3%E6%96%87");
  });

  it.each([
    ["email", { from: "notify@example.com", to: "owner@example.com" }, undefined, "https://api.resend.com/emails", "Bearer resend-secret", "owner@example.com"],
    ["telegram", { chat_id: "12345" }, ["bot_token", "telegram-secret"], "https://api.telegram.org/bottelegram-secret/sendMessage", undefined, "12345"],
    ["bark", { server_url: "https://push.example.com" }, ["device_key", "device-key"], "https://push.example.com/device-key/%E6%A0%87%E9%A2%98/%E6%AD%A3%E6%96%87", undefined, undefined],
    ["serverchan", {}, ["send_key", "send-key-123"], "https://sctapi.ftqq.com/send-key-123.send", undefined, "正文"],
    ["wecom", {}, ["webhook_url", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test"], "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test", undefined, "msgtype"],
    ["feishu", {}, ["webhook_url", "https://open.feishu.cn/open-apis/bot/v2/hook/test"], "https://open.feishu.cn/open-apis/bot/v2/hook/test", undefined, "msg_type"],
    ["discord", {}, ["webhook_url", "https://discord.com/api/webhooks/1/token"], "https://discord.com/api/webhooks/1/token", undefined, "**标题**"],
  ] as const)("%s 使用独立字段构造正确请求", async (name, config, secret, expectedUrl, authorization, bodyFragment) => {
    const responseBody = name === "telegram" ? { ok: true, result: { message_id: 7 } } : name === "bark" ? { code: 200 } : name === "serverchan" ? { code: 0 } : name === "wecom" ? { errcode: 0 } : name === "feishu" ? { code: 0 } : name === "email" ? { id: "email-id" } : {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200, headers: { "Content-Type": "application/json" } }));
    await sendChannelNotification(env, await channel(name, { ...config }, secret ? [...secret] : undefined), { title: "标题", content: "正文" });
    const [url, init] = fetchMock.mock.calls[0];
    const requestedUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const actualAuthorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    const requestBody = typeof init?.body === "string" ? init.body : "";
    expect(requestedUrl).toBe(expectedUrl);
    expect(actualAuthorization).toBe(authorization);
    expect(bodyFragment ? requestBody.includes(bodyFragment) : true).toBe(true);
  });
});
