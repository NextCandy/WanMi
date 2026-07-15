import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, statementsToSql } from "../../src/shared/import-plan";
import { executeSql, queryRows } from "./sqlite-d1";

async function readAllMigrations(): Promise<string> {
  const entries = (await fs.readdir("migrations")).filter((name) => name.endsWith(".sql")).sort();
  const contents = await Promise.all(entries.map((name) => fs.readFile(`migrations/${name}`, "utf8")));
  return contents.join("\n");
}

describe("D1 schema 与 CSV 幂等导入", () => {
  let directory: string;
  let databasePath: string;
  let importSql: string;

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "wanmi-d1-"));
    databasePath = path.join(directory, "wanmi.sqlite");
    const [migration, source] = await Promise.all([
      readAllMigrations(),
      fs.readFile("data/source/WanMi.csv", "utf8"),
    ]);
    executeSql(databasePath, migration);
    importSql = statementsToSql(buildImportStatements(parseDomainCsv(source).records, { importId: "integration-import-1" }));
    executeSql(databasePath, importSql);
  });
  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  function rows<T>(sql: string): T[] { return queryRows<T>(databasePath, sql); }

  it("首次导入得到 859 个域名且不写入售卖平台数据", () => {
    expect(rows<{ domains: number; listings: number; public_domains: number }>("SELECT (SELECT COUNT(*) FROM domains) domains, (SELECT COUNT(*) FROM domain_marketplace_listings) listings, (SELECT COUNT(*) FROM domains WHERE is_listed=1) public_domains")[0]).toEqual({ domains: 859, listings: 0, public_domains: 859 });
  });

  it("仅保存域名和后缀，不保存 CSV 售卖元数据", () => {
    expect(rows<{ count: number }>("SELECT COUNT(*) count FROM domain_marketplace_listings")[0].count).toBe(0);
    expect(rows<{ source: string }>("SELECT DISTINCT source FROM domains")).toEqual([{ source: "domain-list" }]);
    expect(rows<{ registered: number; expiring: number; registrars: number }>("SELECT COUNT(registered_at) registered, COUNT(expires_at) expiring, COUNT(registrar_name) registrars FROM domains")[0]).toEqual({ registered: 859, expiring: 859, registrars: 859 });
  });

  it("重复导入仍为 859 且保留管理员字段", () => {
    executeSql(databasePath, "UPDATE domains SET category='重点', is_featured=1, is_listed=0, notes='人工备注', description='人工简介' WHERE normalized_domain='02cloud.com'");
    executeSql(databasePath, importSql.replaceAll("integration-import-1", "integration-import-2"));
    expect(rows<{ count: number }>("SELECT COUNT(*) count FROM domains")[0].count).toBe(859);
    expect(rows<{ category: string; is_featured: number; is_listed: number; notes: string; description: string; registered_at: string; expires_at: string; registrar_name: string }>("SELECT category,is_featured,is_listed,notes,description,registered_at,expires_at,registrar_name FROM domains WHERE normalized_domain='02cloud.com'")[0]).toEqual({ category: "重点", is_featured: 1, is_listed: 0, notes: "人工备注", description: "人工简介", registered_at: "2025-01-07T00:00:00.000Z", expires_at: "2027-01-07T00:00:00.000Z", registrar_name: "Spaceship" });
  });
});
