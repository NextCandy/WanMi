import { parse } from "csv-parse/browser/esm/sync";

import { DomainValidationError, normalizeDomain } from "./domain";
import {
  DOMAIN_CSV_HEADERS,
  type DomainCsvIssue,
  type DomainCsvParseResult,
  type ParsedDomainRecord,
  type RawDomainCsvRow,
} from "./types/domain";

const NULL_MARKERS = new Set(["", "-", "Members-only feature"]);
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return NULL_MARKERS.has(trimmed) ? null : trimmed;
}

function decimal(value: string, field: string): string | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  const normalized = parsed.replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${field} 不是安全十进制数`);
  return normalized;
}

function integer(value: string, field: string): number | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  if (!/^\d+$/.test(parsed)) throw new Error(`${field} 不是非负整数`);
  const result = Number(parsed);
  if (!Number.isSafeInteger(result)) throw new Error(`${field} 超出安全整数范围`);
  return result;
}

function yesNo(value: string, field: string): boolean | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  if (parsed === "Y") return true;
  if (parsed === "N") return false;
  throw new Error(`${field} 必须为 Y 或 N`);
}

function utcDate(value: string): string | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  const match = /^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/.exec(parsed);
  if (!match || MONTHS[match[1]] === undefined) throw new Error("Date Added (UTC) 格式无效");
  return new Date(Date.UTC(Number(match[3]), MONTHS[match[1]], Number(match[2]))).toISOString();
}

function importedDate(value: string): string | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:T.*)?$/.exec(parsed);
  if (!match) throw new Error("日期格式无效，请使用 YYYY-MM-DD 或 YYYY/M/D");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toISOString();
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function rawRow(headers: string[], values: string[]): RawDomainCsvRow {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as RawDomainCsvRow;
}

function looksLikeDomain(value: string): boolean {
  try {
    normalizeDomain(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 最小模式：只需要域名。支持含 Domain/域名 表头的任意 CSV（其余列忽略），
 * 或没有表头的纯域名列表（每行一个）。市场字段全部置空。
 */
function parseMinimalDomainCsv(
  matrix: string[][],
  headers: string[],
  sourceFile: string,
): DomainCsvParseResult | null {
  const domainColumn = headers.findIndex((header) => /^(domain(\s*name)?|域名)$/i.test(header));
  const headerless = domainColumn === -1 && headers.length >= 1 && looksLikeDomain(headers[0]);
  if (domainColumn === -1 && !headerless) return null;

  const issues: DomainCsvIssue[] = [];
  const records: ParsedDomainRecord[] = [];
  const seen = new Set<string>();
  const tldDistribution: Record<string, number> = {};
  let emptyLineCount = 0;
  let nonEmptyDomainCount = 0;

  const startRow = headerless ? 0 : 1;
  const column = headerless ? 0 : domainColumn;
  const descriptionColumn = headers.findIndex((header) => /^(description|简介)$/i.test(header));
  const premiumColumn = headers.findIndex((header) => /^(premium|精品|是否精品)$/i.test(header));
  const registeredColumn = headers.findIndex((header) => /^(registered(_at)?|registration date|注册日期)$/i.test(header));
  const expiresColumn = headers.findIndex((header) => /^(expires(_at)?|expiry date|expiration date|到期日期)$/i.test(header));
  const registrarColumn = headers.findIndex((header) => /^(registrar|注册商)$/i.test(header));
  for (let index = startRow; index < matrix.length; index += 1) {
    const values = matrix[index];
    const rowNumber = index + 1;
    if (values.every((value) => value.trim() === "")) {
      emptyLineCount += 1;
      continue;
    }
    const rawDomain = (values[column] ?? "").trim();
    if (!rawDomain) {
      issues.push({ rowNumber, domain: "", code: "empty_domain", reason: "域名为空" });
      continue;
    }
    nonEmptyDomainCount += 1;
    try {
      const normalized = normalizeDomain(rawDomain);
      if (seen.has(normalized.normalizedDomain)) {
        issues.push({ rowNumber, domain: rawDomain, code: "duplicate_domain", reason: "标准化后域名重复" });
        continue;
      }
      seen.add(normalized.normalizedDomain);
      increment(tldDistribution, normalized.tld);
      records.push({
        ...normalized,
        rowNumber,
        isListed: true,
        sourceFile,
        buyNowPrice: null,
        floorPrice: null,
        minOffer: null,
        priceCurrency: null,
        leaseToOwn: null,
        maxLeasePeriod: null,
        saleLander: null,
        showBuyNowOption: null,
        showLeaseToOwnOption: null,
        showMakeOfferOption: null,
        hidden: null,
        listingStatus: null,
        fastTransfer: null,
        views: null,
        leads: null,
        uniqueSearches30d: null,
        uniqueSearches90d: null,
        uniqueSearches365d: null,
        totalSearches30d: null,
        totalSearches90d: null,
        totalSearches365d: null,
        godaddyNs: null,
        dateAddedAt: null,
        rawMetadataJson: JSON.stringify({ Domain: rawDomain }),
        initialDescription: descriptionColumn >= 0 ? (values[descriptionColumn] ?? "").trim().slice(0, 500) : "",
        initialFeatured: premiumColumn >= 0 && /^(1|y|yes|true|是|精品)$/i.test((values[premiumColumn] ?? "").trim()),
        initialRegisteredAt: registeredColumn >= 0 ? importedDate(values[registeredColumn] ?? "") : null,
        initialExpiresAt: expiresColumn >= 0 ? importedDate(values[expiresColumn] ?? "") : null,
        initialRegistrarName: registrarColumn >= 0 ? nullable(values[registrarColumn] ?? "") : null,
      });
    } catch (error) {
      const isDomainError = error instanceof DomainValidationError;
      issues.push({
        rowNumber,
        domain: rawDomain,
        code: isDomainError ? error.code : "invalid_field",
        reason: error instanceof Error ? error.message : "未知解析错误",
      });
    }
  }

  const duplicateCount = issues.filter((issue) => issue.code === "duplicate_domain").length;
  return {
    records,
    report: {
      sourceFile,
      headers: headerless ? ["Domain"] : headers,
      rawRecordCount: matrix.length - startRow - emptyLineCount,
      nonEmptyDomainCount,
      parsedCount: records.length,
      validCount: records.length,
      uniqueCount: seen.size,
      duplicateCount,
      invalidCount: issues.length - duplicateCount,
      emptyLineCount,
      hiddenDistribution: {},
      listingStatusDistribution: {},
      tldDistribution,
      issues,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function parseDomainCsv(
  csvText: string,
  sourceFile = "WanMi.csv",
): DomainCsvParseResult {
  const matrix = parse(csvText, {
    bom: true,
    columns: false,
    relax_column_count: true,
    skip_empty_lines: false,
    trim: false,
  });

  if (matrix.length === 0) throw new Error("CSV 文件为空");
  const headers = matrix[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  const duplicateHeaders = headers.filter((header, index) => header !== "" && headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) throw new Error(`CSV 存在重复表头：${[...new Set(duplicateHeaders)].join("、")}`);
  const missingHeaders = DOMAIN_CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    // 非完整市场 CSV：走"只导入域名"最小模式（任意含 Domain/域名 列的 CSV，或无表头纯域名列表）
    const minimal = parseMinimalDomainCsv(matrix, headers, sourceFile);
    if (minimal) return minimal;
    throw new Error(`CSV 缺少表头：${missingHeaders.join("、")}（或改为提供仅含域名的列表）`);
  }

  const issues: DomainCsvIssue[] = [];
  const records: ParsedDomainRecord[] = [];
  const seen = new Set<string>();
  const hiddenDistribution: Record<string, number> = {};
  const listingStatusDistribution: Record<string, number> = {};
  const tldDistribution: Record<string, number> = {};
  let emptyLineCount = 0;
  let nonEmptyDomainCount = 0;

  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index];
    const rowNumber = index + 1;
    if (values.every((value) => value.trim() === "")) {
      emptyLineCount += 1;
      continue;
    }
    const raw = rawRow(headers, values);
    const rawDomain = raw.Domain.trim();
    if (!rawDomain) {
      issues.push({ rowNumber, domain: "", code: "empty_domain", reason: "Domain 为空" });
      continue;
    }
    nonEmptyDomainCount += 1;

    try {
      const normalized = normalizeDomain(rawDomain, raw.TLD);
      if (seen.has(normalized.normalizedDomain)) {
        issues.push({
          rowNumber,
          domain: rawDomain,
          code: "duplicate_domain",
          reason: "标准化后域名重复",
        });
        continue;
      }
      seen.add(normalized.normalizedDomain);

      const hidden = yesNo(raw.Hidden, "Hidden");
      const listingStatus = nullable(raw["Listing Status"]);
      increment(hiddenDistribution, raw.Hidden.trim() || "(空)");
      increment(listingStatusDistribution, listingStatus ?? "(空)");
      increment(tldDistribution, normalized.tld);

      records.push({
        ...normalized,
        rowNumber,
        isListed: hidden !== true,
        sourceFile,
        buyNowPrice: decimal(raw["Buy Now Price"], "Buy Now Price"),
        floorPrice: decimal(raw["Floor Price"], "Floor Price"),
        minOffer: decimal(raw["Min Offer"], "Min Offer"),
        priceCurrency: null,
        leaseToOwn: yesNo(raw["Lease to Own"], "Lease to Own"),
        maxLeasePeriod: integer(raw["Max Lease Period"], "Max Lease Period"),
        saleLander: nullable(raw["Sale Lander"]),
        showBuyNowOption: yesNo(raw["Show Buy Now Option"], "Show Buy Now Option"),
        showLeaseToOwnOption: yesNo(raw["Show Lease to Own Option"], "Show Lease to Own Option"),
        showMakeOfferOption: yesNo(raw["Show Make Offer Option"], "Show Make Offer Option"),
        hidden,
        listingStatus,
        fastTransfer: nullable(raw["Fast Transfer"]),
        views: integer(raw.Views, "Views"),
        leads: integer(raw.Leads, "Leads"),
        uniqueSearches30d: integer(raw["30-day Unique Searches"], "30-day Unique Searches"),
        uniqueSearches90d: integer(raw["90-day Unique Searches"], "90-day Unique Searches"),
        uniqueSearches365d: integer(raw["365-day Unique Searches"], "365-day Unique Searches"),
        totalSearches30d: integer(raw["30-day Total Searches"], "30-day Total Searches"),
        totalSearches90d: integer(raw["90-day Total Searches"], "90-day Total Searches"),
        totalSearches365d: integer(raw["365-day Total Searches"], "365-day Total Searches"),
        godaddyNs: nullable(raw["GoDaddy NS"]),
        dateAddedAt: utcDate(raw["Date Added (UTC)"]),
        rawMetadataJson: JSON.stringify(raw),
        initialDescription: "",
        initialFeatured: false,
        initialRegisteredAt: null,
        initialExpiresAt: null,
        initialRegistrarName: null,
      });
    } catch (error) {
      const isDomainError = error instanceof DomainValidationError;
      issues.push({
        rowNumber,
        domain: rawDomain,
        code: isDomainError ? error.code : "invalid_field",
        reason: error instanceof Error ? error.message : "未知解析错误",
      });
    }
  }

  const duplicateCount = issues.filter((issue) => issue.code === "duplicate_domain").length;
  const invalidCount = issues.length - duplicateCount;
  return {
    records,
    report: {
      sourceFile,
      headers,
      rawRecordCount: matrix.length - 1 - emptyLineCount,
      nonEmptyDomainCount,
      parsedCount: records.length,
      validCount: records.length,
      uniqueCount: seen.size,
      duplicateCount,
      invalidCount,
      emptyLineCount,
      hiddenDistribution,
      listingStatusDistribution,
      tldDistribution,
      issues,
      generatedAt: new Date().toISOString(),
    },
  };
}
