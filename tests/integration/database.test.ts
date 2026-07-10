import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { buildImportStatements, statementsToSql } from "../../src/shared/import-plan";

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
      fs.readFile("data/source/domains-1783619533.csv", "utf8"),
    ]);
    execFileSync("sqlite3", [databasePath], { input: migration });
    importSql = statementsToSql(buildImportStatements(parseDomainCsv(source).records, { importId: "integration-import-1" }));
    execFileSync("sqlite3", [databasePath], { input: importSql, maxBuffer: 50 * 1024 * 1024 });
  });
  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  function rows<T>(sql: string): T[] { const output = execFileSync("sqlite3", ["-json", databasePath, sql], { encoding: "utf8" }).trim(); return output ? JSON.parse(output) as T[] : []; }

  it("首次导入得到 662/662/662", () => {
    expect(rows<{ domains: number; listings: number; public_domains: number }>("SELECT (SELECT COUNT(*) FROM domains) domains, (SELECT COUNT(*) FROM domain_marketplace_listings) listings, (SELECT COUNT(*) FROM domains WHERE is_listed=1) public_domains")[0]).toEqual({ domains: 662, listings: 662, public_domains: 662 });
  });

  it("保留全部市场字段和真实状态分布", () => {
    const statuses = rows<{ listing_status: string; count: number }>("SELECT listing_status, COUNT(*) count FROM domain_marketplace_listings GROUP BY listing_status ORDER BY count DESC");
    expect(Object.fromEntries(statuses.map((item) => [item.listing_status, item.count]))).toEqual({ Listed: 656, "Ownership Review": 3, "Failed Compliance": 3 });
    expect(rows<{ raw_count: number }>("SELECT COUNT(*) raw_count FROM domain_marketplace_listings WHERE raw_metadata_json IS NOT NULL")[0].raw_count).toBe(662);
  });

  it("重复导入仍为 662 且保留管理员字段", () => {
    execFileSync("sqlite3", [databasePath, "UPDATE domains SET category='重点', is_featured=1, is_listed=0, notes='人工备注' WHERE normalized_domain='02cloud.com'" ]);
    execFileSync("sqlite3", [databasePath], { input: importSql.replaceAll("integration-import-1", "integration-import-2"), maxBuffer: 50 * 1024 * 1024 });
    expect(rows<{ count: number }>("SELECT COUNT(*) count FROM domains")[0].count).toBe(662);
    expect(rows<{ category: string; is_featured: number; is_listed: number; notes: string }>("SELECT category,is_featured,is_listed,notes FROM domains WHERE normalized_domain='02cloud.com'")[0]).toEqual({ category: "重点", is_featured: 1, is_listed: 0, notes: "人工备注" });
  });
});
