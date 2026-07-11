import type { ParsedDomainRecord } from "./types/domain";

export interface SqlStatement {
  sql: string;
  params: Array<string | number | null>;
}

export function buildRemoteQueryBody(statements: SqlStatement[]): { batch: SqlStatement[] } {
  return { batch: statements };
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
] as const;

function recordParams(
  importId: string,
  record: ParsedDomainRecord,
): Array<string | number | null> {
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
  ];
}

export function buildImportStatements(
  records: ParsedDomainRecord[],
  options: { importId: string; currency?: string | null; defaultListed?: boolean | null },
): SqlStatement[] {
  const insertStaging = `INSERT INTO domain_import_staging (${STAGING_COLUMNS.join(", ")}) VALUES (${STAGING_COLUMNS.map(() => "?").join(", ")})`;
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
          SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END), 0, 0
        FROM domain_import_staging s
        LEFT JOIN domains d ON d.normalized_domain = s.normalized_domain
        WHERE s.import_id = ?`,
      params: [options.importId, options.importId],
    },
    {
      sql: `INSERT INTO domains (
          full_domain, normalized_domain, name, tld, is_listed, source, source_imported_at
        )
        SELECT full_domain, normalized_domain, name, tld, 1, 'domain-list', NULL
        FROM domain_import_staging WHERE import_id = ?
        ON CONFLICT(normalized_domain) DO UPDATE SET
          full_domain = excluded.full_domain,
          name = excluded.name,
          tld = excluded.tld,
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP`,
      params: [options.importId],
    },
    {
      sql: "UPDATE sync_runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [options.importId],
    },
    {
      sql: `INSERT INTO operation_logs (
          level, action, resource_type, resource_id, message, details_json, success
        ) VALUES (
          'info', 'domains.import', 'csv_import', ?, 'CSV 域名导入完成',
          json_object('record_count', ?), 1
        )`,
      params: [options.importId, records.length],
    },
    {
      sql: "DELETE FROM domain_import_staging WHERE import_id = ?",
      params: [options.importId],
    },
  ];
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
