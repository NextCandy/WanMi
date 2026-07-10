import { Hono } from "hono";

import { changePasswordSchema, loginSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import { requireAuth, requireCsrf } from "../../middleware/auth";
import { hashPassword, verifyPassword } from "../../security/crypto";
import {
  clearSessionCookies,
  createSession,
  ensureBootstrapAdmin,
  loginRateLimited,
  recordLoginAttempt,
} from "../../security/session";
import type { AppBindings } from "../../types";

interface AdminRow {
  id: number;
  email: string;
  password_hash: string;
  password_salt: string;
  password_algorithm: string;
  password_iterations: number;
  password_version: number;
}

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_LOGIN", "请输入有效的账号和密码");
  const { email, password } = parsed.data;
  if (await loginRateLimited(c, email)) return fail(c, 429, "LOGIN_RATE_LIMITED", "登录尝试过多，请 15 分钟后再试");

  await ensureBootstrapAdmin(c.env);
  const user = await c.env.DB.prepare(
    `SELECT id, email, password_hash, password_salt, password_algorithm,
      password_iterations, password_version
     FROM admin_users WHERE email = ? AND is_active = 1`,
  )
    .bind(email)
    .first<AdminRow>();
  const valid =
    user !== null &&
    (await verifyPassword(password, {
      hash: user.password_hash,
      salt: user.password_salt,
      algorithm: user.password_algorithm,
      iterations: user.password_iterations,
    }));
  await recordLoginAttempt(c, email, valid);
  if (!valid || !user) return fail(c, 401, "INVALID_CREDENTIALS", "账号或密码错误");

  await c.env.DB.prepare("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(user.id)
    .run();
  await createSession(c, { id: user.id, passwordVersion: user.password_version });
  await writeOperationLog(c.env.DB, {
    action: "auth.login",
    resourceType: "admin_user",
    resourceId: user.id,
    message: "管理员登录成功",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { user: { id: user.id, email: user.email } });
});

authRoutes.use("/*", requireAuth);

authRoutes.get("/me", (c) => {
  const user = c.get("authUser");
  return ok(c, { id: user.id, email: user.email, sessionId: user.sessionId });
});

authRoutes.use("/*", requireCsrf);

authRoutes.post("/logout", async (c) => {
  const user = c.get("authUser");
  await c.env.DB.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(user.sessionId)
    .run();
  clearSessionCookies(c);
  await writeOperationLog(c.env.DB, {
    action: "auth.logout",
    resourceType: "admin_session",
    resourceId: user.sessionId,
    message: "管理员退出登录",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { loggedOut: true });
});

authRoutes.post("/change-password", async (c) => {
  const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_PASSWORD", "新密码至少 12 位");
  const authUser = c.get("authUser");
  const user = await c.env.DB.prepare(
    `SELECT id, password_hash, password_salt, password_algorithm, password_iterations, password_version
     FROM admin_users WHERE id = ?`,
  )
    .bind(authUser.id)
    .first<AdminRow>();
  if (!user) return fail(c, 401, "AUTH_REQUIRED", "会话已失效");
  const currentValid = await verifyPassword(parsed.data.currentPassword, {
    hash: user.password_hash,
    salt: user.password_salt,
    algorithm: user.password_algorithm,
    iterations: user.password_iterations,
  });
  if (!currentValid) return fail(c, 401, "INVALID_CREDENTIALS", "当前密码错误");
  const digest = await hashPassword(parsed.data.newPassword);
  const newVersion = user.password_version + 1;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE admin_users SET password_hash = ?, password_salt = ?, password_algorithm = ?,
        password_iterations = ?, password_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(digest.hash, digest.salt, digest.algorithm, digest.iterations, newVersion, user.id),
    c.env.DB.prepare("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(user.id),
  ]);
  await createSession(c, { id: user.id, passwordVersion: newVersion });
  await writeOperationLog(c.env.DB, {
    action: "auth.change_password",
    resourceType: "admin_user",
    resourceId: user.id,
    message: "管理员修改密码并撤销旧会话",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { changed: true });
});

authRoutes.get("/sessions", async (c) => {
  const user = c.get("authUser");
  const result = await c.env.DB.prepare(
    `SELECT id, expires_at, created_at, last_seen_at, user_agent, ip_country,
      CASE WHEN id = ? THEN 1 ELSE 0 END AS is_current
     FROM admin_sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC`,
  )
    .bind(user.sessionId, user.id)
    .all();
  return ok(c, result.results);
});

authRoutes.delete("/sessions/:id", async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("id");
  const result = await c.env.DB.prepare(
    "UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
  )
    .bind(sessionId, user.id)
    .run();
  if (result.meta.changes === 0) return fail(c, 404, "SESSION_NOT_FOUND", "会话不存在");
  if (sessionId === user.sessionId) clearSessionCookies(c);
  return ok(c, { revoked: true });
});

authRoutes.post("/logout-others", async (c) => {
  const user = c.get("authUser");
  const result = await c.env.DB.prepare(
    "UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
  )
    .bind(user.id, user.sessionId)
    .run();
  return ok(c, { revoked: result.meta.changes });
});
