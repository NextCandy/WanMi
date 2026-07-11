import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, buildRemoteQueryBody } from "../../src/shared/import-plan";

describe("D1 导入计划", () => {
  it("662 条记录保持在 D1 免费层单批上限内", async () => {
    const source = await fs.readFile("data/source/domains-1783619533.csv", "utf8");
    const records = parseDomainCsv(source).records;
    const statements = buildImportStatements(records, { importId: "test-import" });
    expect(statements).toHaveLength(668);
    expect(statements.length).toBeLessThanOrEqual(1000);
    expect(statements.filter((statement) => statement.sql.startsWith("INSERT INTO domain_import_staging"))).toHaveLength(662);
    expect(statements.some((statement) => statement.sql.includes("domain_marketplace_listings"))).toBe(false);
    expect(buildRemoteQueryBody(statements)).toEqual({ batch: statements });
  });

  it("重新导入 SQL 不覆盖管理员字段", async () => {
    const source = await fs.readFile("data/source/domains-1783619533.csv", "utf8");
    const statements = buildImportStatements(parseDomainCsv(source).records.slice(0, 1), { importId: "test" });
    const domainsUpsert = statements.find((statement) => statement.sql.includes("INSERT INTO domains"))!.sql;
    expect(domainsUpsert).not.toMatch(/is_featured\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/is_listed\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/category\s*=\s*excluded/i);
    expect(domainsUpsert).not.toMatch(/notes\s*=\s*excluded/i);
  });
});
