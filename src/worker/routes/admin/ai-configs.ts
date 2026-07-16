import { Hono } from "hono";

import { aiConfigCreateSchema, aiConfigPatchSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import { encryptCredentials } from "../../security/crypto";
import type { AiConfigRow } from "../../services/domain-description-ai";
import type { AppBindings } from "../../types";

export const aiConfigRoutes = new Hono<AppBindings>();

function presentConfig(row: AiConfigRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    promptTemplate: row.prompt_template,
    isActive: Boolean(row.is_active),
    configured: Boolean(row.api_key_encrypted && row.api_key_iv),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

aiConfigRoutes.get("/ai-configs", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT * FROM ai_configs ORDER BY is_active DESC, created_at ASC, name ASC",
  ).all<AiConfigRow>();
  return ok(c, { items: result.results.map(presentConfig) });
});

aiConfigRoutes.post("/ai-configs", async (c) => {
  const parsed = aiConfigCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_AI_CONFIG", "AI 配置无效", parsed.error.issues);
  const id = crypto.randomUUID();
  const encrypted = await encryptCredentials({ apiKey: parsed.data.apiKey }, c.env.CREDENTIALS_ENCRYPTION_KEY);
  const statements: D1PreparedStatement[] = [];
  if (parsed.data.isActive) statements.push(c.env.DB.prepare("UPDATE ai_configs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1"));
  statements.push(c.env.DB.prepare(
    `INSERT INTO ai_configs (
      id, name, provider, base_url, model, prompt_template,
      api_key_encrypted, api_key_iv, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    parsed.data.name,
    parsed.data.provider,
    parsed.data.baseUrl,
    parsed.data.model,
    parsed.data.promptTemplate,
    encrypted.encrypted,
    encrypted.iv,
    parsed.data.isActive ? 1 : 0,
  ));
  await c.env.DB.batch(statements);
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "ai.config.create",
    resourceType: "ai_config",
    resourceId: id,
    message: `新增 AI 配置：${parsed.data.name}`,
    details: { provider: parsed.data.provider, model: parsed.data.model, active: parsed.data.isActive },
    actorUserId: user.id,
    success: true,
  });
  const created = await c.env.DB.prepare("SELECT * FROM ai_configs WHERE id = ?").bind(id).first<AiConfigRow>();
  return ok(c, presentConfig(created!), 201);
});

aiConfigRoutes.patch("/ai-configs/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM ai_configs WHERE id = ?").bind(id).first<AiConfigRow>();
  if (!existing) return fail(c, 404, "AI_CONFIG_NOT_FOUND", "AI 配置不存在");
  const parsed = aiConfigPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_AI_CONFIG", "AI 配置无效", parsed.error.issues);
  const fields: string[] = [];
  const values: string[] = [];
  const fieldMap = { name: "name", provider: "provider", baseUrl: "base_url", model: "model", promptTemplate: "prompt_template" } as const;
  for (const [input, column] of Object.entries(fieldMap) as Array<[keyof typeof fieldMap, string]>) {
    const value = parsed.data[input];
    if (typeof value === "string") {
      fields.push(`${column} = ?`);
      values.push(value);
    }
  }
  if (parsed.data.apiKey) {
    const encrypted = await encryptCredentials({ apiKey: parsed.data.apiKey }, c.env.CREDENTIALS_ENCRYPTION_KEY);
    fields.push("api_key_encrypted = ?", "api_key_iv = ?");
    values.push(encrypted.encrypted, encrypted.iv);
  }
  fields.push("updated_at = CURRENT_TIMESTAMP");
  await c.env.DB.prepare(`UPDATE ai_configs SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "ai.config.update",
    resourceType: "ai_config",
    resourceId: id,
    message: `更新 AI 配置：${parsed.data.name ?? existing.name}`,
    details: { apiKeyChanged: Boolean(parsed.data.apiKey) },
    actorUserId: user.id,
    success: true,
  });
  const updated = await c.env.DB.prepare("SELECT * FROM ai_configs WHERE id = ?").bind(id).first<AiConfigRow>();
  return ok(c, presentConfig(updated!));
});

aiConfigRoutes.post("/ai-configs/:id/activate", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM ai_configs WHERE id = ?").bind(id).first<AiConfigRow>();
  if (!existing) return fail(c, 404, "AI_CONFIG_NOT_FOUND", "AI 配置不存在");
  if (!existing.api_key_encrypted || !existing.api_key_iv) return fail(c, 409, "AI_CONFIG_NOT_READY", "请先填写 API Key 再启用该配置");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE ai_configs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1"),
    c.env.DB.prepare("UPDATE ai_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
  ]);
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "ai.config.activate",
    resourceType: "ai_config",
    resourceId: id,
    message: `启用 AI 配置：${existing.name}`,
    details: { provider: existing.provider, model: existing.model },
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { activated: true, id });
});

aiConfigRoutes.delete("/ai-configs/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM ai_configs WHERE id = ?").bind(id).first<AiConfigRow>();
  if (!existing) return fail(c, 404, "AI_CONFIG_NOT_FOUND", "AI 配置不存在");
  if (existing.is_active) return fail(c, 409, "ACTIVE_AI_CONFIG", "当前启用配置不能删除，请先启用其他配置");
  await c.env.DB.prepare("DELETE FROM ai_configs WHERE id = ?").bind(id).run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "ai.config.delete",
    resourceType: "ai_config",
    resourceId: id,
    message: `删除 AI 配置：${existing.name}`,
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { deleted: true });
});
