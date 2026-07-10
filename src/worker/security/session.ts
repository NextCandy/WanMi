import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import type { AppBindings, AuthUser, Env } from "../types";
import { hashPassword, hmacSha256, randomToken } from "./crypto";

export const SESSION_COOKIE = "wanmi_session";
export const CSRF_COOKIE = "wanmi_csrf";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

interface AdminSessionRow {
  session_id: string;
  user_id: number;
  email: string;
  csrf_token_hash: string;
  password_version: number;
}

function cookieSecure(c: Context<AppBindings>): boolean {
  const hostname = new URL(c.req.url).hostname;
  return hostname !== "localhost" && hostname !== "127.0.0.1";
}

export async function ensureBootstrapAdmin(env: Env): Promise<void> {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("ADMIN_EMAIL 格式无效");
  const existing = await env.DB.prepare("SELECT id FROM admin_users WHERE email = ?").bind(email).first();
  if (existing) return;
  if (!env.BOOTSTRAP_ADMIN_PASSWORD || env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD 未设置或长度不足 12 位");
  }
  const digest = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO admin_users (
      email, password_hash, password_salt, password_algorithm, password_iterations
    ) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(email, digest.hash, digest.salt, digest.algorithm, digest.iterations)
    .run();
}

export function requestIp(c: Context<AppBindings>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function createSession(
  c: Context<AppBindings>,
  user: { id: number; passwordVersion: number },
): Promise<{ sessionId: string; csrfToken: string }> {
  const sessionId = crypto.randomUUID();
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const [tokenHash, csrfTokenHash, ipHash] = await Promise.all([
    hmacSha256(token, c.env.SESSION_SECRET),
    hmacSha256(csrfToken, c.env.SESSION_SECRET),
    hmacSha256(requestIp(c), c.env.SESSION_SECRET),
  ]);
  await c.env.DB.prepare(
    `INSERT INTO admin_sessions (
      id, user_id, token_hash, csrf_token_hash, password_version, expires_at, ip_hash, user_agent, ip_country
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      user.id,
      tokenHash,
      csrfTokenHash,
      user.passwordVersion,
      expiresAt,
      ipHash,
      (c.req.header("user-agent") ?? "unknown").slice(0, 500),
      c.req.header("cf-ipcountry") ?? null,
    )
    .run();

  const secure = cookieSecure(c);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  setCookie(c, CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return { sessionId, csrfToken };
}

export function clearSessionCookies(c: Context<AppBindings>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: cookieSecure(c) });
  deleteCookie(c, CSRF_COOKIE, { path: "/", secure: cookieSecure(c) });
}

export async function authenticate(c: Context<AppBindings>): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hmacSha256(token, c.env.SESSION_SECRET);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, s.csrf_token_hash, u.password_version
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND s.password_version = u.password_version
       AND u.is_active = 1`,
  )
    .bind(tokenHash)
    .first<AdminSessionRow>();
  if (!row) return null;
  await c.env.DB.prepare("UPDATE admin_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(row.session_id)
    .run();
  return {
    id: row.user_id,
    email: row.email,
    sessionId: row.session_id,
    csrfTokenHash: row.csrf_token_hash,
    passwordVersion: row.password_version,
  };
}

export async function csrfIsValid(c: Context<AppBindings>, user: AuthUser): Promise<boolean> {
  const header = c.req.header("x-csrf-token");
  const cookie = getCookie(c, CSRF_COOKIE);
  if (!header || !cookie || header !== cookie) return false;
  return (await hmacSha256(header, c.env.SESSION_SECRET)) === user.csrfTokenHash;
}

export async function loginRateLimited(c: Context<AppBindings>, email: string): Promise<boolean> {
  const [emailHash, ipHash] = await Promise.all([
    hmacSha256(email, c.env.SESSION_SECRET),
    hmacSha256(requestIp(c), c.env.SESSION_SECRET),
  ]);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS failures FROM auth_login_attempts
     WHERE email_hash = ? AND ip_hash = ? AND success = 0
       AND attempted_at >= datetime('now', '-15 minutes')`,
  )
    .bind(emailHash, ipHash)
    .first<{ failures: number }>();
  return (row?.failures ?? 0) >= 5;
}

export async function recordLoginAttempt(
  c: Context<AppBindings>,
  email: string,
  success: boolean,
): Promise<void> {
  const [emailHash, ipHash] = await Promise.all([
    hmacSha256(email, c.env.SESSION_SECRET),
    hmacSha256(requestIp(c), c.env.SESSION_SECRET),
  ]);
  await c.env.DB.prepare(
    "INSERT INTO auth_login_attempts (email_hash, ip_hash, success) VALUES (?, ?, ?)",
  )
    .bind(emailHash, ipHash, success ? 1 : 0)
    .run();
}
