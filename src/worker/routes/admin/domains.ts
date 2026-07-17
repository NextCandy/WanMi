import { Hono } from "hono";

import { parseDomainCsv } from "../../../shared/csv";
import { normalizeDomain } from "../../../shared/domain";
import { buildImportStatements, diffImportRecord, type ExistingDomainSnapshot } from "../../../shared/import-plan";
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

function dateAtUtcMidnight(value: string | null | undefined): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

type ExistingDomainRow = ExistingDomainSnapshot & { normalized_domain: string };

/** 取回 CSV 中已存在域名的当前值，用于 dry-run 的字段级差异比较 */
async function existingDomainRows(db: D1Database, normalizedDomains: string[]): Promise<Map<string, ExistingDomainRow>> {
  const unique = [...new Set(normalizedDomains)];
  const statements = [];
  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80);
    statements.push(
      db.prepare(
        `SELECT normalized_domain, registered_at, expires_at, registrar_name, description
         FROM domains WHERE normalized_domain IN (${chunk.map(() => "?").join(",")})`,
      ).bind(...chunk),
    );
  }
  if (!statements.length) return new Map();
  const results = await db.batch<ExistingDomainRow>(statements);
  return new Map(results.flatMap((result) => result.results.map((row) => [row.normalized_domain, row] as const)));
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
  if (query.registrar) {
    clauses.push("d.registrar_name = ? COLLATE NOCASE");
    params.push(query.registrar);
  }
  if (query.registeredFrom) {
    clauses.push("date(d.registered_at) >= date(?)");
    params.push(query.registeredFrom);
  }
  if (query.registeredTo) {
    clauses.push("date(d.registered_at) <= date(?)");
    params.push(query.registeredTo);
  }
  if (query.expiresFrom) {
    clauses.push("date(d.expires_at) >= date(?)");
    params.push(query.expiresFrom);
  }
  if (query.expiresTo) {
    clauses.push("date(d.expires_at) <= date(?)");
    params.push(query.expiresTo);
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
    : query.orderBy === "registered_at" ? "d.registered_at"
    : query.orderBy === "expires_at" ? "d.expires_at"
    : query.orderBy === "registrar" ? "d.registrar_name COLLATE NOCASE"
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
  const [tlds, categories, registrars] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT tld, COUNT(*) AS count FROM domains WHERE tld != '' GROUP BY tld ORDER BY count DESC, tld ASC"),
    c.env.DB.prepare("SELECT auto_category AS name, COUNT(*) AS count FROM domains GROUP BY auto_category ORDER BY count DESC, auto_category ASC"),
    c.env.DB.prepare("SELECT registrar_name AS registrar, COUNT(*) AS count FROM domains WHERE registrar_name IS NOT NULL AND registrar_name != '' GROUP BY registrar_name COLLATE NOCASE ORDER BY count DESC, registrar_name COLLATE NOCASE ASC"),
  ]);
  return ok(c, { tlds: tlds.results, categories: categories.results, registrars: registrars.results });
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
        public_price, public_price_currency, public_price_approved, notes, source,
        description, registered_at, expires_at, registrar_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)`,
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
        parsed.data.description ?? "",
        dateAtUtcMidnight(parsed.data.registeredAt),
        dateAtUtcMidnight(parsed.data.expiresAt),
        parsed.data.registrarName || null,
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
    `SELECT d.full_domain, d.tld, d.registered_at, d.expires_at,
      COALESCE(NULLIF(d.registrar_name, ''), '') AS registrar,
      d.description
     FROM domains d
     WHERE ${where}
     ORDER BY d.normalized_domain ASC`,
  ).bind(...params).all();
  const headers = ["域名", "后缀", "注册日期", "到期日期", "注册商", "简介"];
  const lines = [headers.map(csvCell).join(",")];
  for (const raw of result.results) {
    const row = raw;
    lines.push([
      row.full_domain, typeof row.tld === "string" && row.tld ? `.${row.tld.replace(/^\./, "")}` : "",
      typeof row.registered_at === "string" ? row.registered_at.slice(0, 10) : "",
      typeof row.expires_at === "string" ? row.expires_at.slice(0, 10) : "",
      row.registrar, row.description,
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
  const existing = await existingDomainRows(c.env.DB, result.records.map((record) => record.normalizedDomain));
  // 冲突 = 已存在且在 update 模式下确实会有字段被改写；仅同名但内容一致的不算冲突
  const conflicts = result.records.flatMap((record) => {
    const current = existing.get(record.normalizedDomain);
    if (!current) return [];
    const diffs = diffImportRecord(record, current);
    return diffs.length ? [{ rowNumber: record.rowNumber, domain: record.normalizedDomain, diffs }] : [];
  });
  const preview = {
    totalRows: result.report.rawRecordCount,
    validRows: result.records.length,
    invalidRows: result.report.invalidCount,
    duplicateRows: result.report.duplicateCount,
    newRows: result.records.length - existing.size,
    existingRows: existing.size,
    conflictRows: conflicts.length,
    rows: result.records.slice(0, 120).map((record) => ({
      rowNumber: record.rowNumber,
      domain: record.normalizedDomain,
      status: existing.has(record.normalizedDomain) ? "existing" : "new",
    })),
    conflicts: conflicts.slice(0, 120),
    issues: result.report.issues.slice(0, 120),
    truncated: result.records.length > 120 || result.report.issues.length > 120 || conflicts.length > 120,
  };
  const dryRun = form.dryRun === "true";
  if (dryRun) return ok(c, { dryRun: true, report: result.report, preview });
  const conflictMode = form.conflictMode === "update" ? "update" : form.conflictMode === "skip" ? "skip" : null;
  if (!conflictMode) return fail(c, 422, "CONFLICT_MODE_REQUIRED", "请选择跳过或更新现有记录");
  const importId = crypto.randomUUID();
  const user = c.get("authUser");
  const statements = buildImportStatements(result.records, {
    importId,
    conflictMode,
    archiveMissing: false,
    actorUserId: user.id,
  });
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
    imported: conflictMode === "update" ? result.records.length : result.records.length - existing.size,
    inserted: result.records.length - existing.size,
    updated: conflictMode === "update" ? existing.size : 0,
    skipped: conflictMode === "skip" ? existing.size : 0,
    conflictMode,
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
  const matched = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM domains WHERE id IN (${placeholders})`).bind(...ids).first<{ count: number }>();
  const changed = Number(matched?.count ?? 0);
  await c.env.DB.prepare(sql).bind(...params).run();
  const user = c.get("authUser");
  const message = `批量操作 ${action}，影响 ${changed} 个域名`;
  await writeOperationLog(c.env.DB, {
    action: `domains.bulk.${action}`,
    resourceType: "domain",
    message,
    details: { count: changed },
    actorUserId: user.id,
    success: true,
  });
  return ok(c, { changed });
});

domainAdminRoutes.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`${DETAIL_SELECT} WHERE d.id = ?`).bind(Number(c.req.param("id"))).first();
  if (!row) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  return ok(c, row);
});

domainAdminRoutes.patch("/:id", async (c) => {
  const parsed = domainPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "INVALID_DOMAIN", "域名设置无效", parsed.error.issues);
  const before = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ?").bind(Number(c.req.param("id"))).first<Record<string, unknown>>();
  if (!before) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
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
    ["registeredAt", "registered_at", (value) => dateAtUtcMidnight(value as string | null)],
    ["expiresAt", "expires_at", (value) => dateAtUtcMidnight(value as string | null)],
    ["registrarName", "registrar_name", (value) => typeof value === "string" && value ? value.trim() : null],
  ];
  if (parsed.data.fullDomain !== undefined || parsed.data.tld !== undefined) {
    try {
      const normalized = normalizeDomain(
        parsed.data.fullDomain ?? String(before.full_domain),
        parsed.data.tld,
      );
      fields.push("full_domain = ?", "normalized_domain = ?", "name = ?", "tld = ?");
      values.push(normalized.fullDomain, normalized.normalizedDomain, normalized.name, normalized.tld);
    } catch (error) {
      return fail(c, 422, "INVALID_DOMAIN", error instanceof Error ? error.message : "域名无效");
    }
  }
  for (const [key, column, convert] of mapping) {
    if (parsed.data[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(convert(parsed.data[key]));
    }
  }
  if (fields.length === 0) return fail(c, 422, "NO_CHANGES", "没有可保存的修改");
  values.push(Number(c.req.param("id")));
  let result;
  try {
    result = await c.env.DB.prepare(`UPDATE domains SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...values)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) return fail(c, 409, "DOMAIN_EXISTS", "域名已存在");
    throw error;
  }
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
