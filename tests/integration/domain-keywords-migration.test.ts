import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeSql, queryRows } from "./sqlite-d1";

describe("0017 域名关键词兼容迁移", () => {
  let directory: string;
  let databasePath: string;

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "wanmi-keywords-migration-"));
    databasePath = path.join(directory, "wanmi.sqlite");
    const names = (await fs.readdir("migrations"))
      .filter((name) => name.endsWith(".sql") && name < "0017_domain_keywords_field.sql")
      .sort();
    const historical = await Promise.all(names.map((name) => fs.readFile(`migrations/${name}`, "utf8")));
    executeSql(databasePath, historical.join("\n"));
    executeSql(databasePath, `
      INSERT INTO domains (full_domain, normalized_domain, name, tld, source, description)
      VALUES
        ('keywords.example', 'keywords.example', 'keywords', 'example', 'manual', '梦想，模型、品牌'),
        ('placeholder.example', 'placeholder.example', 'placeholder', 'example', 'manual', '简介待补充'),
        ('empty.example', 'empty.example', 'empty', 'example', 'manual', '');
    `);
    executeSql(databasePath, await fs.readFile("migrations/0017_domain_keywords_field.sql", "utf8"));
  });

  afterAll(async () => fs.rm(directory, { recursive: true, force: true }));

  it("为正式表和导入暂存表新增关键词列", () => {
    const domainColumns = queryRows<{ name: string }>(databasePath, "PRAGMA table_info(domains)").map((row) => row.name);
    const stagingColumns = queryRows<{ name: string }>(databasePath, "PRAGMA table_info(domain_import_staging)").map((row) => row.name);
    expect(domainColumns).toContain("keywords");
    expect(stagingColumns).toContain("keywords");
  });

  it("按三种逗号迁移有效简介，同时完整保留原简介和全部域名", () => {
    expect(queryRows(databasePath, "SELECT normalized_domain, description, keywords FROM domains ORDER BY normalized_domain")).toEqual([
      { normalized_domain: "empty.example", description: "", keywords: "" },
      { normalized_domain: "keywords.example", description: "梦想，模型、品牌", keywords: "梦想,模型,品牌" },
      { normalized_domain: "placeholder.example", description: "简介待补充", keywords: "" },
    ]);
  });
});
