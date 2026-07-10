import { Hono } from "hono";

import { categoryInputSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import type { AppBindings } from "../../types";

export const categoryRoutes = new Hono<AppBindings>();

categoryRoutes.get("/categories", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT dc.id, dc.name, dc.sort_order, dc.created_at,
      (SELECT COUNT(*) FROM domains d WHERE d.category = dc.name) AS domain_count
     FROM domain_categories dc ORDER BY dc.sort_order ASC, dc.name ASC`,
  ).all();
  return ok(c, result.results);
});

categoryRoutes.post("/categories", async (c) => {
  const parsed = categoryInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_CATEGORY", "分类名无效", parsed.error.issues);
  try {
    const result = await c.env.DB.prepare("INSERT INTO domain_categories (name) VALUES (?)").bind(parsed.data.name).run();
    const user = c.get("authUser");
    await writeOperationLog(c.env.DB, {
      action: "categories.create",
      resourceType: "domain_category",
      resourceId: result.meta.last_row_id,
      message: `新建分类 ${parsed.data.name}`,
      actorUserId: user.id,
      success: true,
    });
    return ok(c, { id: result.meta.last_row_id, name: parsed.data.name }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) return fail(c, 409, "CATEGORY_EXISTS", "分类已存在");
    throw error;
  }
});

categoryRoutes.delete("/categories/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const category = await c.env.DB.prepare("SELECT name FROM domain_categories WHERE id = ?").bind(id).first<{ name: string }>();
  if (!category) return fail(c, 404, "CATEGORY_NOT_FOUND", "分类不存在");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE domains SET category = NULL, updated_at = CURRENT_TIMESTAMP WHERE category = ?").bind(category.name),
    c.env.DB.prepare("DELETE FROM domain_categories WHERE id = ?").bind(id),
  ]);
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "categories.delete",
    resourceType: "domain_category",
    resourceId: id,
    message: `删除分类 ${category.name}，关联域名已置为未分类`,
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { deleted: true });
});
