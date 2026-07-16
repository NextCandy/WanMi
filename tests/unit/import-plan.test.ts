import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, buildRemoteQueryBody, diffImportRecord } from "../../src/shared/import-plan";

describe("D1 导入计划", () => {
  it("本次记录保持在 D1 免费层单批上限内", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const records = parseDomainCsv(source).records;
    const statements = buildImportStatements(records, { importId: "test-import" });
    expect(statements).toHaveLength(866);
    expect(statements.length).toBeLessThanOrEqual(1000);
    expect(statements.filter((statement) => statement.sql.startsWith("INSERT INTO domain_import_staging"))).toHaveLength(859);
    expect(statements.some((statement) => statement.sql.includes("domain_marketplace_listings"))).toBe(false);
    expect(buildRemoteQueryBody(statements)).toEqual({ batch: statements });
    expect(statements.some((statement) => statement.sql.includes("normalized_domain NOT IN"))).toBe(true);
  });

  it("重新导入 SQL 保护管理员字段，并仅用非空关键词更新展示内容", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const statements = buildImportStatements(parseDomainCsv(source).records.slice(0, 1), { importId: "test" });
    const domainsUpsert = statements.find((statement) => statement.sql.includes("INSERT INTO domains"))!.sql;
    expect(domainsUpsert).not.toMatch(/is_featured\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/is_listed\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/(?:^|\s)category\s*=\s*excluded\.category/i);
    expect(domainsUpsert).not.toMatch(/notes\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/description\s*=\s*excluded/i);
    expect(domainsUpsert).toMatch(/keywords\s*=\s*CASE WHEN excluded\.keywords != ''/i);
    expect(domainsUpsert).toMatch(/registered_at\s*=\s*COALESCE\(excluded\.registered_at/i);
    expect(domainsUpsert).toMatch(/expires_at\s*=\s*COALESCE\(excluded\.expires_at/i);
    expect(domainsUpsert).toMatch(/registrar_name\s*=\s*COALESCE\(excluded\.registrar_name/i);
  });

  it("后台预览导入可默认跳过冲突且不会归档文件外域名", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const statements = buildImportStatements(parseDomainCsv(source).records.slice(0, 2), {
      importId: "admin-preview",
      conflictMode: "skip",
      archiveMissing: false,
      actorUserId: 1,
    });
    const domainsInsert = statements.find((statement) => statement.sql.includes("INSERT INTO domains"))!.sql;
    expect(domainsInsert).toContain("DO NOTHING");
    expect(statements.some((statement) => statement.sql.includes("normalized_domain NOT IN"))).toBe(false);
    expect(statements.find((statement) => statement.sql.includes("INSERT INTO operation_logs"))?.params).toContain(1);
  });
});

describe("dry-run 字段差异", () => {
  async function firstRecord() {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    return parseDomainCsv(source).records[0];
  }

  it("库内值与 CSV 一致时没有差异", async () => {
    const record = await firstRecord();
    expect(diffImportRecord(record, {
      registered_at: record.initialRegisteredAt,
      expires_at: record.initialExpiresAt,
      registrar_name: record.initialRegistrarName,
      description: record.initialDescription,
      keywords: record.initialKeywords,
    })).toEqual([]);
  });

  it("库内 ISO 时间与 CSV 日期只比较日期部分", async () => {
    const record = { ...(await firstRecord()), initialRegisteredAt: "2015-05-12", initialExpiresAt: null, initialRegistrarName: null, initialDescription: "", initialKeywords: "" };
    expect(diffImportRecord(record, {
      registered_at: "2015-05-12T00:00:00.000Z",
      expires_at: null,
      registrar_name: null,
      description: "",
      keywords: "",
    })).toEqual([]);
  });

  it("CSV 留空的字段不算差异，因为导入会保留原值", async () => {
    const record = { ...(await firstRecord()), initialRegisteredAt: null, initialExpiresAt: null, initialRegistrarName: null, initialDescription: "", initialKeywords: "" };
    expect(diffImportRecord(record, {
      registered_at: "2015-05-12T00:00:00.000Z",
      expires_at: null,
      registrar_name: "Spaceship",
      description: "现有简介",
      keywords: "现有关键词",
    })).toEqual([]);
  });

  it("列出会被改写字段的新旧值", async () => {
    const record = { ...(await firstRecord()), initialRegisteredAt: null, initialExpiresAt: null, initialRegistrarName: "Spaceship", initialDescription: "", initialKeywords: "新关键词" };
    expect(diffImportRecord(record, {
      registered_at: null,
      expires_at: null,
      registrar_name: "易名",
      description: "保留的简介",
      keywords: "旧关键词",
    })).toEqual([
      { field: "registrar_name", label: "注册商", currentValue: "易名", incomingValue: "Spaceship" },
      { field: "keywords", label: "关键词", currentValue: "旧关键词", incomingValue: "新关键词" },
    ]);
  });
});
