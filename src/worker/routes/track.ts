import { Hono } from "hono";
import { z } from "zod";

import { fail, ok } from "../http";
import { hmacSha256 } from "../security/crypto";
import { requestIp } from "../security/session";
import type { AppBindings } from "../types";

const inputSchema = z.object({
  kind: z.enum(["page_view", "domain_click"]),
  path: z.string().max(500).optional(),
  domain: z.string().trim().toLowerCase().max(253).optional(),
  visitor_id: z.string().uuid(),
});

const limits = new Map<string, { minute: number; count: number }>();

function uaSummary(value: string): string {
  const browser = /Edg\//.test(value) ? "Edge" : /Chrome\//.test(value) ? "Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : "Other";
  const os = /Windows/.test(value) ? "Windows" : /Android/.test(value) ? "Android" : /iPhone|iPad/.test(value) ? "iOS" : /Mac OS/.test(value) ? "macOS" : /Linux/.test(value) ? "Linux" : "Other";
  return `${browser} / ${os}`;
}

export const trackRoutes = new Hono<AppBindings>();

trackRoutes.post("/", async (c) => {
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "TRACK_INVALID", "统计事件无效");
  const ip = requestIp(c);
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = limits.get(ip);
  if (bucket?.minute === minute && bucket.count >= 30) return fail(c, 429, "TRACK_RATE_LIMITED", "统计请求过于频繁");
  limits.set(ip, bucket?.minute === minute ? { minute, count: bucket.count + 1 } : { minute, count: 1 });
  if (limits.size > 2000) for (const [key, value] of limits) if (value.minute < minute) limits.delete(key);
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = await hmacSha256(ip, `${c.env.SESSION_SECRET}:${day}`);
  const country = c.req.header("cf-ipcountry") ?? null;
  await c.env.DB.prepare("INSERT INTO stats_events (ts, kind, path, domain, visitor_id, ip_hash, ua_summary, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(Math.floor(Date.now() / 1000), parsed.data.kind, parsed.data.path ?? null, parsed.data.domain ?? null, parsed.data.visitor_id, ipHash, uaSummary(c.req.header("user-agent") ?? ""), country)
    .run();
  return ok(c, { tracked: true }, 201);
});
