import type { ParsedDomainRecord } from "./types/domain";

export interface SqlStatement {
  sql: string;
  params: Array<string | number | null>;
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
  "buy_now_price",
  "floor_price",
  "min_offer",
  "price_currency",
  "lease_to_own",
  "max_lease_period",
  "sale_lander",
  "show_buy_now_option",
  "show_lease_to_own_option",
  "show_make_offer_option",
  "hidden",
  "listing_status",
  "fast_transfer",
  "views",
  "leads",
  "unique_searches_30d",
  "unique_searches_90d",
  "unique_searches_365d",
  "total_searches_30d",
  "total_searches_90d",
  "total_searches_365d",
  "godaddy_ns",
  "date_added_at",
  "raw_metadata_json",
] as const;

function flag(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}

function recordParams(
  importId: string,
  record: ParsedDomainRecord,
  currency: string | null,
  defaultListed: boolean | null,
): Array<string | number | null> {
  return [
    importId,
    record.rowNumber,
    record.fullDomain,
    record.normalizedDomain,
    record.name,
    record.tld,
    defaultListed === null ? flag(record.isListed) : flag(defaultListed),
    record.sourceFile,
    record.buyNowPrice,
    record.floorPrice,
    record.minOffer,
    currency,
    flag(record.leaseToOwn),
    record.maxLeasePeriod,
    record.saleLander,
    flag(record.showBuyNowOption),
    flag(record.showLeaseToOwnOption),
    flag(record.showMakeOfferOption),
    flag(record.hidden),
    record.listingStatus,
    record.fastTransfer,
    record.views,
    record.leads,
    record.uniqueSearches30d,
    record.uniqueSearches90d,
    record.uniqueSearches365d,
    record.totalSearches30d,
    record.totalSearches90d,
    record.totalSearches365d,
    record.godaddyNs,
    record.dateAddedAt,
    record.rawMetadataJson,
  ];
}

export function buildImportStatements(
  records: ParsedDomainRecord[],
  options: { importId: string; currency?: string | null; defaultListed?: boolean | null },
): SqlStatement[] {
  const currency = options.currency ?? null;
  const defaultListed = options.defaultListed ?? null;
  const insertStaging = `INSERT INTO domain_import_staging (${STAGING_COLUMNS.join(", ")}) VALUES (${STAGING_COLUMNS.map(() => "?").join(", ")})`;
  const statements: SqlStatement[] = [
    {
      sql: "DELETE FROM domain_import_staging WHERE import_id = ?",
      params: [options.importId],
    },
    ...records.map((record) => ({
      sql: insertStaging,
      params: recordParams(options.importId, record, currency, defaultListed),
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
        SELECT full_domain, normalized_domain, name, tld, is_listed, 'csv', CURRENT_TIMESTAMP
        FROM domain_import_staging WHERE import_id = ?
        ON CONFLICT(normalized_domain) DO UPDATE SET
          full_domain = excluded.full_domain,
          name = excluded.name,
          tld = excluded.tld,
          source = excluded.source,
          source_imported_at = excluded.source_imported_at,
          updated_at = CURRENT_TIMESTAMP`,
      params: [options.importId],
    },
    {
      sql: `INSERT INTO domain_marketplace_listings (
          domain_id, source_name, source_file, buy_now_price, floor_price, min_offer, price_currency,
          lease_to_own, max_lease_period, sale_lander, show_buy_now_option,
          show_lease_to_own_option, show_make_offer_option, hidden, listing_status, fast_transfer,
          views, leads, unique_searches_30d, unique_searches_90d, unique_searches_365d,
          total_searches_30d, total_searches_90d, total_searches_365d, godaddy_ns,
          date_added_at, raw_metadata_json, updated_at
        )
        SELECT d.id, 'afternic', s.source_file, s.buy_now_price, s.floor_price, s.min_offer,
          s.price_currency, s.lease_to_own, s.max_lease_period, s.sale_lander,
          s.show_buy_now_option, s.show_lease_to_own_option, s.show_make_offer_option,
          s.hidden, s.listing_status, s.fast_transfer, s.views, s.leads,
          s.unique_searches_30d, s.unique_searches_90d, s.unique_searches_365d,
          s.total_searches_30d, s.total_searches_90d, s.total_searches_365d,
          s.godaddy_ns, s.date_added_at, s.raw_metadata_json, CURRENT_TIMESTAMP
        FROM domain_import_staging s
        JOIN domains d ON d.normalized_domain = s.normalized_domain
        WHERE s.import_id = ?
        ON CONFLICT(domain_id, source_name) DO UPDATE SET
          source_file = excluded.source_file,
          buy_now_price = excluded.buy_now_price,
          floor_price = excluded.floor_price,
          min_offer = excluded.min_offer,
          price_currency = excluded.price_currency,
          lease_to_own = excluded.lease_to_own,
          max_lease_period = excluded.max_lease_period,
          sale_lander = excluded.sale_lander,
          show_buy_now_option = excluded.show_buy_now_option,
          show_lease_to_own_option = excluded.show_lease_to_own_option,
          show_make_offer_option = excluded.show_make_offer_option,
          hidden = excluded.hidden,
          listing_status = excluded.listing_status,
          fast_transfer = excluded.fast_transfer,
          views = excluded.views,
          leads = excluded.leads,
          unique_searches_30d = excluded.unique_searches_30d,
          unique_searches_90d = excluded.unique_searches_90d,
          unique_searches_365d = excluded.unique_searches_365d,
          total_searches_30d = excluded.total_searches_30d,
          total_searches_90d = excluded.total_searches_90d,
          total_searches_365d = excluded.total_searches_365d,
          godaddy_ns = excluded.godaddy_ns,
          date_added_at = excluded.date_added_at,
          raw_metadata_json = excluded.raw_metadata_json,
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
