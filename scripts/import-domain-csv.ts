import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { assertExpectedReport, readAndParseSource, writeGenerated } from "./domain-csv-common";
import { buildImportStatements, statementsToSql } from "./import-plan";

const args = new Set(process.argv.slice(2));
const remote = args.has("--remote");
const local = args.has("--local") || !remote;
const dryRun = args.has("--dry-run");
const currencyArg = process.argv.find((value) => value.startsWith("--currency="));
const currency = currencyArg?.slice("--currency=".length) || null;
const defaultListed = args.has("--default-listed") ? true : null;
const result = await readAndParseSource();
assertExpectedReport(result);
await writeGenerated(result);

const importId = crypto.randomUUID();
const statements = buildImportStatements(result.records, { importId, currency, defaultListed });
if (statements.length > 1000) throw new Error(`D1 batch 超过 1000 条限制：${statements.length}`);

if (dryRun) {
  console.log(`CSV 导入 dry-run 通过：${result.records.length} 条，D1 batch ${statements.length} 条。`);
  process.exit(0);
}

if (remote) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    throw new Error("远程导入需要 CLOUDFLARE_ACCOUNT_ID、D1_DATABASE_ID 和 CLOUDFLARE_API_TOKEN");
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(statements),
    },
  );
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`远程 D1 导入失败：HTTP ${response.status} ${JSON.stringify(body)}`);
  console.log(`远程 D1 导入完成：${result.records.length} 条，import_id=${importId}`);
} else if (local) {
  const sqlPath = path.resolve("data/generated/domains.import.sql");
  const sql = statementsToSql(statements);
  await fs.writeFile(sqlPath, sql, "utf8");
  const stateDirectory = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const stateFiles = await fs.readdir(stateDirectory);
  const databaseFile = stateFiles.find((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  if (!databaseFile) throw new Error("未找到 Wrangler 本地 D1 状态文件，请先运行 pnpm db:migrate:local");
  execFileSync("sqlite3", [path.join(stateDirectory, databaseFile)], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(`本地 D1 导入完成：${result.records.length} 条，import_id=${importId}`);
}
