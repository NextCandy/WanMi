import { Hono } from "hono";

import { parseDomainCsv } from "../../../shared/csv";
import { normalizeDomain } from "../../../shared/domain";
import { buildImportStatements } from "../../../shared/import-plan";
import {
  adminDomainQuerySchema,
  bulkDomainSchema,
  domainInputSchema,
  domainPatchSchema,
} from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import type { AppBindings } from "../../types";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 900;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function adminFilters(query: ReturnType<typeof adminDomainQuerySchema.parse>): {
  where: string;
  params: Array<string | number>;
} {
  const clauses = ["1 = 1"];
  const params: Array<string | number> = [];
  if (query.q) {
    clauses.push("d.normalized_domain LIKE ? ESCAPE '\\'");
    params.push(`%${query.q.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }
  if (query.tld) {
    clauses.push("d.tld = ?");
    params.push(query.tld.toLowerCase().replace(/^\./, ""));
  }
  if (query.length) {
    clauses.push("length(replace(d.name, '.', '')) = ?");
    params.push(query.length);
  }
  if (query.category) {
    clauses.push("COALESCE(NULLIF(d.category, ''), d.auto_category) = ?");
    params.push(query.category);
  }
  if (query.featured) {
    clauses.push("d.is_featured = ?");
    params.push(query.featured === "true" ? 1 : 0);
  }
  if (query.listed) {
    clauses.push("d.is_listed = ?");
    params.push(query.listed === "true" ? 1 : 0);
  }
  if (query.ids) {
    const ids = query.ids.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 500);
    if (ids.length > 0) clauses.push(`d.id IN (${ids.join(",")})`);
  }
  return { where: clauses.join(" AND "), params };
}

function adminOrderBy(query: ReturnType<typeof adminDomainQuerySchema.parse>): string {
  const direction = query.dir === "desc" ? "DESC" : "ASC";
  const column =
    query.orderBy === "domain" ? "d.normalized_domain"
    : null;
  if (column) return `${column} IS NULL, ${column} ${direction}, d.normalized_domain ASC`;
  if (query.sort === "domain_desc") return "d.normalized_domain DESC";
  return "d.is_featured DESC, length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC";
}

const DETAIL_SELECT = `SELECT d.*,
  COALESCE(NULLIF(d.category, ''), d.auto_category) AS effective_category,
  CASE WHEN d.category IS NULL OR d.category = '' THEN 'auto' ELSE 'manual' END AS category_source
  FROM domains d`;

export const domainAdminRoutes = new Hono<AppBindings>();

domainAdminRoutes.get("/", async (c) => {
  const parsed = adminDomainQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "筛选参数无效", parsed.error.issues);
  const query = parsed.data;
  const { where, params } = adminFilters(query);
  const offset = (query.page - 1) * query.pageSize;
  const sort = adminOrderBy(query);
  const [countResult, rowsResult] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(DISTINCT d.id) AS total FROM domains d WHERE ${where}`).bind(...params),
    c.env.DB.prepare(`${DETAIL_SELECT} WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...params, query.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  return ok(c, {
    items: rowsResult.results,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

domainAdminRoutes.get("/filters", async (c) => {
  const [tlds, categories] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains WHERE tld != '' GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare("SELECT auto_category AS name, COUNT(*) AS count FROM domains GROUP BY auto_category ORDER BY count DESC, auto_category ASC"),
  ]);
  return ok(c, { tlds: tlds.results, categories: categories.results });
});

domainAdminRoutes.post("/", async (c) => {
  const parsed = domainInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_DOMAIN", "域名数据无效", parsed.error.issues);
  let domain;
  try {
    domain = normalizeDomain(parsed.data.fullDomain, parsed.data.tld);
  } catch (error) {
    return fail(c, 422, "INVALID_DOMAIN", error instanceof Error ? error.message : "域名无效");
  }
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO domains (
        full_domain, normalized_domain, name, tld, category, is_featured, is_listed,
        public_price, public_price_currency, public_price_approved, notes, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
    )
      .bind(
        domain.fullDomain,
        domain.normalizedDomain,
        domain.name,
        domain.tld,
        parsed.data.category ?? null,
        parsed.data.isFeatured ? 1 : 0,
        parsed.data.isListed === false ? 0 : 1,
        parsed.data.publicPrice ?? null,
        parsed.data.publicPriceCurrency?.toUpperCase() ?? null,
        parsed.data.publicPriceApproved ? 1 : 0,
        parsed.data.notes ?? null,
      )
      .run();
    const user = c.get("authUser");
    await writeOperationLog(c.env.DB, {
      action: "domains.create",
      resourceType: "domain",
      resourceId: result.meta.last_row_id,
      message: `添加域名 ${domain.normalizedDomain}`,
      actorUserId: user.id,
      success: true,
    });
    return ok(c, { id: result.meta.last_row_id, ...domain }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) return fail(c, 409, "DOMAIN_EXISTS", "域名已存在");
    throw error;
  }
});

domainAdminRoutes.get("/export", async (c) => {
  const parsed = adminDomainQuerySchema.safeParse({ ...c.req.query(), page: 1, pageSize: 200 });
  if (!parsed.success) return fail(c, 422, "INVALID_QUERY", "筛选参数无效");
  const { where, params } = adminFilters(parsed.data);
  const result = await c.env.DB.prepare(
    `SELECT d.full_domain, d.created_at AS registered_at, d.expires_at, d.tld,
      COALESCE(NULLIF(d.category, ''), d.auto_category) AS category,
      d.is_featured, d.is_listed, d.description
     FROM domains d
     WHERE ${where}
     ORDER BY d.normalized_domain ASC`,
  ).bind(...params).all();
  const headers = ["域名", "注册日期", "到期日期", "后缀", "分类", "精品", "前台展示", "简介"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of result.results) {
    lines.push([
      row.full_domain,
      row.registered_at,
      row.expires_at,
      row.tld,
      row.category,
      row.is_featured ? "是" : "否",
      row.is_listed ? "是" : "否",
      row.description,
    ].map(csvCell).join(","));
  }
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "domains.export",
    resourceType: "domain",
    message: `导出 ${result.results.length} 个域名`,
    details: { count: result.results.length },
    actorUserId: user.id,
    success: true,
  });
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="WanMi-domains-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

domainAdminRoutes.post("/import", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) return fail(c, 422, "CSV_REQUIRED", "请选择 CSV 文件");
  if (file.size > MAX_IMPORT_BYTES) return fail(c, 413, "CSV_TOO_LARGE", "CSV 文件不能超过 5 MB");
  if (!file.name.toLowerCase().endsWith(".csv")) return fail(c, 422, "CSV_TYPE_INVALID", "仅支持 CSV 文件");
  const result = parseDomainCsv(await file.text(), file.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
  if (result.records.length === 0) return fail(c, 422, "CSV_EMPTY", "CSV 中没有可导入的合法域名", result.report.issues);
  if (result.records.length > MAX_IMPORT_RECORDS) return fail(c, 413, "CSV_TOO_MANY_ROWS", `单次最多导入 ${MAX_IMPORT_RECORDS} 条`);
  const dryRun = form.dryRun === "true";
  if (dryRun) return ok(c, { dryRun: true, report: result.report });
  const importId = crypto.randomUUID();
  const statements = buildImportStatements(result.records, { importId });
  await c.env.DB.batch(statements.map((statement) => c.env.DB.prepare(statement.sql).bind(...statement.params)));
  if (result.report.issues.length > 0) {
    const insert = c.env.DB.prepare(
      "INSERT INTO domain_import_errors (import_id, row_number, domain, code, reason) VALUES (?, ?, ?, ?, ?)",
    );
    await c.env.DB.batch(
      result.report.issues.map((issue) =>
        insert.bind(importId, issue.rowNumber, issue.domain || null, issue.code, issue.reason),
      ),
    );
  }
  return ok(c, {
    importId,
    imported: result.records.length,
    errorCount: result.report.issues.length,
    report: result.report,
    errorDownloadUrl: result.report.issues.length > 0 ? `/api/admin/domains/import-errors/${importId}` : null,
  });
});

domainAdminRoutes.get("/import-errors/:id", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT row_number, domain, code, reason FROM domain_import_errors WHERE import_id = ? ORDER BY row_number",
  )
    .bind(c.req.param("id"))
    .all();
  if (result.results.length === 0) return fail(c, 404, "IMPORT_ERRORS_NOT_FOUND", "未找到导入错误");
  const lines = ["Row,Domain,Code,Reason", ...result.results.map((raw) => {
    const row = raw;
    return [row.row_number, row.domain, row.code, row.reason].map(csvCell).join(",");
  })];
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="WanMi-import-errors-${c.req.param("id")}.csv"` },
  });
});

domainAdminRoutes.post("/bulk", async (c) => {
  const parsed = bulkDomainSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_BULK_ACTION", "批量操作参数无效", parsed.error.issues);
  const { ids, action, category, price } = parsed.data;
  const placeholders = ids.map(() => "?").join(",");
  let sql: string;
  let params: Array<string | number | null> = ids;
  if (action === "delete") sql = `DELETE FROM domains WHERE id IN (${placeholders})`;
  else if (action === "feature") sql = `UPDATE domains SET is_featured = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
  else if (action === "unfeature") sql = `UPDATE domains SET is_featured = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
  else if (action === "list") sql = `UPDATE domains SET is_listed = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
  else if (action === "hide") sql = `UPDATE domains SET is_listed = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
  else if (action === "price") {
    // 设置公开报价并自动过审；price 为 null 时清除报价
    sql = `UPDATE domains SET public_price = ?, public_price_approved = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    params = [price ?? null, price ? 1 : 0, ...ids];
  } else {
    sql = `UPDATE domains SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    params = [category ?? null, ...ids];
  }
  const result = await c.env.DB.prepare(sql).bind(...params).run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: `domains.bulk.${action}`,
    resourceType: "domain",
    message: `批量操作 ${action}，影响 ${result.meta.changes} 个域名`,
    details: { count: result.meta.changes },
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { changed: result.meta.changes });
});

domainAdminRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`${DETAIL_SELECT} WHERE d.id = ?`).bind(Number(c.req.param("id"))).first();
  if (!row) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  return ok(c, row);
});

domainAdminRoutes.patch("/:id", async (c) => {
  const parsed = domainPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_DOMAIN", "域名设置无效", parsed.error.issues);
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  const mapping: Array<[keyof typeof parsed.data, string, (value: unknown) => string | number | null]> = [
    ["category", "category", (value) => value as string | null],
    ["isFeatured", "is_featured", (value) => (value ? 1 : 0)],
    ["isListed", "is_listed", (value) => (value ? 1 : 0)],
    ["publicPrice", "public_price", (value) => value as string | null],
    ["publicPriceCurrency", "public_price_currency", (value) => typeof value === "string" ? value.toUpperCase() : null],
    ["publicPriceApproved", "public_price_approved", (value) => (value ? 1 : 0)],
    ["notes", "notes", (value) => value as string | null],
    ["description", "description", (value) => value as string],
  ];
  for (const [key, column, convert] of mapping) {
    if (parsed.data[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(convert(parsed.data[key]));
    }
  }
  if (fields.length === 0) return fail(c, 422, "NO_CHANGES", "没有可保存的修改");
  values.push(Number(c.req.param("id")));
  const before = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ?").bind(Number(c.req.param("id"))).first<Record<string, unknown>>();
  if (!before) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  const result = await c.env.DB.prepare(`UPDATE domains SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(...values)
    .run();
  if (result.meta.changes === 0) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  const user = c.get("authUser");
  const changes = fields.map((field, index) => {
    const column = field.slice(0, field.indexOf(" ="));
    return { field: column, oldValue: before[column] ?? null, newValue: values[index] ?? null };
  });
  await writeOperationLog(c.env.DB, {
    action: "domains.update",
    resourceType: "domain",
    resourceId: c.req.param("id"),
    message: "更新域名设置",
    details: { domain: before.normalized_domain, changes },
    actorUserId: user.id,
    success: true,
  });
  const updated = await c.env.DB.prepare(`${DETAIL_SELECT} WHERE d.id = ?`).bind(Number(c.req.param("id"))).first();
  return ok(c, updated);
});

domainAdminRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const domain = await c.env.DB.prepare("SELECT normalized_domain FROM domains WHERE id = ?").bind(id).first<{ normalized_domain: string }>();
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  await c.env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(id).run();
  const user = c.get("authUser");
  await writeOperationLog(c.env.DB, {
    action: "domains.delete",
    resourceType: "domain",
    resourceId: id,
    message: `删除域名 ${domain.normalized_domain}`,
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { deleted: true });
});
