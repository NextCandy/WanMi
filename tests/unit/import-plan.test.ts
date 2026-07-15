import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, buildRemoteQueryBody } from "../../src/shared/import-plan";

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

  it("重新导入 SQL 不覆盖管理员字段", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const statements = buildImportStatements(parseDomainCsv(source).records.slice(0, 1), { importId: "test" });
    const domainsUpsert = statements.find((statement) => statement.sql.includes("INSERT INTO domains"))!.sql;
    expect(domainsUpsert).not.toMatch(/is_featured\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/is_listed\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/(?:^|\s)category\s*=\s*excluded\.category/i);
    expect(domainsUpsert).not.toMatch(/notes\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/description\s*=\s*excluded/i);
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
