import type { ParsedDomainRecord } from "./types/domain";
import { classifyDomain } from "./auto-classify";

export interface SqlStatement {
  sql: string;
  params: Array<string | number | null>;
}

export function buildRemoteQueryBody(statements: SqlStatement[]): { batch: SqlStatement[] } {
  return { batch: statements };
}

export interface ExistingDomainSnapshot {
  registered_at: string | null;
  expires_at: string | null;
  registrar_name: string | null;
  description: string | null;
  keywords: string | null;
}

export interface ImportFieldDiff {
  field: string;
  label: string;
  currentValue: string;
  incomingValue: string;
}

/** 只比较日期部分，避免 CSV 与库内时间格式差异被误判为变更 */
function dateKey(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * 列出 update 模式下真正会被改写的字段，规则必须与下方 ON CONFLICT 子句一致：
 * 日期和注册商走 COALESCE（CSV 为空则保留原值），简介和关键词走 CASE WHEN != ''（空串保留原值）。
 * category、is_featured、is_listed、notes 不在更新列内，因此不参与比较。
 */
export function diffImportRecord(record: ParsedDomainRecord, existing: ExistingDomainSnapshot): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = [];
  const push = (field: string, label: string, currentValue: string, incomingValue: string) => {
    if (currentValue !== incomingValue) diffs.push({ field, label, currentValue, incomingValue });
  };
  if (record.initialRegisteredAt !== null) push("registered_at", "注册日期", dateKey(existing.registered_at), dateKey(record.initialRegisteredAt));
  if (record.initialExpiresAt !== null) push("expires_at", "到期日期", dateKey(existing.expires_at), dateKey(record.initialExpiresAt));
  if (record.initialRegistrarName !== null) push("registrar_name", "注册商", existing.registrar_name ?? "", record.initialRegistrarName);
  if (record.initialDescription !== "") push("description", "简介", existing.description ?? "", record.initialDescription);
  if (record.initialKeywords !== "") push("keywords", "关键词", existing.keywords ?? "", record.initialKeywords);
  return diffs;
}

const STAGING_COLUMNS = [
  "import_id",
  "row_number",
  "full_domain",
  "normalized_domain",
  "name",
  "tld",
  "is_listed",
  "source_file",
  "raw_metadata_json",
  "description",
  "keywords",
  "is_featured",
  "auto_category",
  "auto_subcategory",
  "auto_category_confidence",
  "registered_at",
  "expires_at",
  "registrar_name",
] as const;

function recordParams(
  importId: string,
  record: ParsedDomainRecord,
): Array<string | number | null> {
  const classification = classifyDomain(record.name);
  return [
    importId,
    record.rowNumber,
    record.fullDomain,
    record.normalizedDomain,
    record.name,
    record.tld,
    1,
    "domain-list",
    "{}",
    record.initialDescription,
    record.initialKeywords,
    record.initialFeatured ? 1 : 0,
    classification.primary,
    classification.subtype,
    classification.confidence,
    record.initialRegisteredAt,
    record.initialExpiresAt,
    record.initialRegistrarName,
  ];
}

export function buildImportStatements(
  records: ParsedDomainRecord[],
  options: {
    importId: string;
    currency?: string | null;
    defaultListed?: boolean | null;
    conflictMode?: "update" | "skip";
    archiveMissing?: boolean;
    actorUserId?: number | null;
  },
): SqlStatement[] {
  const conflictMode = options.conflictMode ?? "update";
  const archiveMissing = options.archiveMissing ?? true;
  const insertStaging = `INSERT INTO domain_import_staging (${STAGING_COLUMNS.join(", ")}) VALUES (${STAGING_COLUMNS.map(() => "?").join(", ")})`;
  const conflictClause = conflictMode === "skip"
    ? "ON CONFLICT(normalized_domain) DO NOTHING"
    : `ON CONFLICT(normalized_domain) DO UPDATE SET
          full_domain = excluded.full_domain,
          name = excluded.name,
          tld = excluded.tld,
          source = excluded.source,
          auto_category = excluded.auto_category,
          auto_subcategory = excluded.auto_subcategory,
          auto_category_confidence = excluded.auto_category_confidence,
          registered_at = COALESCE(excluded.registered_at, domains.registered_at),
          expires_at = COALESCE(excluded.expires_at, domains.expires_at),
          registrar_name = COALESCE(excluded.registrar_name, domains.registrar_name),
          description = CASE WHEN excluded.description != '' THEN excluded.description ELSE domains.description END,
          keywords = CASE WHEN excluded.keywords != '' THEN excluded.keywords ELSE domains.keywords END,
          updated_at = CURRENT_TIMESTAMP`;
  const statements: SqlStatement[] = [
    {
      sql: "DELETE FROM domain_import_staging WHERE import_id = ?",
      params: [options.importId],
    },
    ...records.map((record) => ({
      sql: insertStaging,
      params: recordParams(options.importId, record),
    })),
    {
      sql: `INSERT INTO sync_runs (id, source, status, inserted_count, updated_count, skipped_count, error_count)
        SELECT ?, 'csv', 'running',
          SUM(CASE WHEN d.id IS NULL THEN 1 ELSE 0 END),
          ${conflictMode === "update" ? "SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END)" : "0"},
          ${conflictMode === "skip" ? "SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END)" : "0"}, 0
        FROM domain_import_staging s
        LEFT JOIN domains d ON d.normalized_domain = s.normalized_domain
        WHERE s.import_id = ?`,
      params: [options.importId, options.importId],
    },
    {
      sql: `INSERT INTO domains (
          full_domain, normalized_domain, name, tld, is_listed, source, source_imported_at, description, keywords, is_featured,
          auto_category, auto_subcategory, auto_category_confidence, registered_at, expires_at, registrar_name
        )
        SELECT full_domain, normalized_domain, name, tld, 1, 'domain-list', NULL, description, keywords, is_featured,
          auto_category, auto_subcategory, auto_category_confidence, registered_at, expires_at, registrar_name
        FROM domain_import_staging WHERE import_id = ?
        ${conflictClause}`,
      params: [options.importId],
    },
  ];
  if (archiveMissing) {
    statements.push({
      sql: `UPDATE domains SET is_listed = 0, updated_at = CURRENT_TIMESTAMP
        WHERE source = 'domain-list'
          AND normalized_domain NOT IN (
            SELECT normalized_domain FROM domain_import_staging WHERE import_id = ?
          )`,
      params: [options.importId],
    });
  }
  statements.push(
    {
      sql: "UPDATE sync_runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [options.importId],
    },
    {
      sql: `INSERT INTO operation_logs (
          level, action, resource_type, resource_id, message, details_json, actor_user_id, success
        ) VALUES (
          'info', 'domains.import', 'csv_import', ?, 'CSV 域名导入完成',
          json_object('record_count', ?, 'conflict_mode', ?, 'archive_missing', ?), ?, 1
        )`,
      params: [options.importId, records.length, conflictMode, archiveMissing ? 1 : 0, options.actorUserId ?? null],
    },
    {
      sql: "DELETE FROM domain_import_staging WHERE import_id = ?",
      params: [options.importId],
    },
  );
  return statements;
}

function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

export function statementsToSql(statements: SqlStatement[]): string {
  const rendered = statements.map((statement) => {
    let parameterIndex = 0;
    const sql = statement.sql.replaceAll("?", () => sqlValue(statement.params[parameterIndex++] ?? null));
    if (parameterIndex !== statement.params.length) throw new Error("SQL 参数数量不匹配");
    return `${sql};`;
  });
  return ["PRAGMA foreign_keys = ON;", "BEGIN IMMEDIATE;", ...rendered, "COMMIT;", ""].join("\n");
}
