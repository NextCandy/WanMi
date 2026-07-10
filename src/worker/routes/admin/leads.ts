import { Hono } from "hono";

import { leadPatchSchema, leadsQuerySchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import type { AppBindings } from "../../types";

export const leadRoutes = new Hono<AppBindings>();

leadRoutes.get("/leads", async (c) => {
  const parsed = leadsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "分页参数无效", parsed.error.issues);
  const query = parsed.data;
  const where = query.status ? "WHERE l.status = ?" : "";
  const params: string[] = query.status ? [query.status] : [];
  const [count, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM domain_leads l ${where}`).bind(...params),
    c.env.DB.prepare(
      `SELECT l.id, l.offer_amount, l.currency, l.contact, l.message, l.country, l.status, l.created_at,
        d.full_domain
       FROM domain_leads l JOIN domains d ON d.id = l.domain_id
       ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, query.pageSize, (query.page - 1) * query.pageSize),
  ]);
  const total = Number((count.results[0] as { total?: number } | undefined)?.total ?? 0);
  return ok(c, { items: rows.results, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) });
});

leadRoutes.patch("/leads/:id", async (c) => {
  const parsed = leadPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_LEAD", "线索状态无效", parsed.error.issues);
  const result = await c.env.DB.prepare("UPDATE domain_leads SET status = ? WHERE id = ?")
    .bind(parsed.data.status, Number(c.req.param("id")))
    .run();
  if (result.meta.changes === 0) return fail(c, 404, "LEAD_NOT_FOUND", "线索不存在");
  return ok(c, { changed: true });
});

leadRoutes.delete("/leads/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const result = await c.env.DB.prepare("DELETE FROM domain_leads WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) return fail(c, 404, "LEAD_NOT_FOUND", "线索不存在");
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "leads.delete",
    resourceType: "domain_lead",
    resourceId: id,
    message: "删除求购线索",
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { deleted: true });
});
