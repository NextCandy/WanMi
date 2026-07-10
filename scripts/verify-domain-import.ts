import { execFileSync } from "node:child_process";

import { EXPECTED_DOMAIN_COUNT } from "./domain-csv-common";

const remote = process.argv.includes("--remote");
const command = `SELECT
  (SELECT COUNT(*) FROM domains) AS domains,
  (SELECT COUNT(*) FROM domain_marketplace_listings) AS listings,
  (SELECT COUNT(*) FROM domains WHERE is_listed = 1) AS public_domains,
  (SELECT COUNT(*) FROM domains WHERE normalized_domain = 'wanmi.org') AS has_wanmi_org,
  (SELECT COUNT(*) FROM domains WHERE normalized_domain = '02cloud.com') AS has_02cloud;`;
const stdout = execFileSync(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "wanmi-db", remote ? "--remote" : "--local", "--json", "--command", command],
  { encoding: "utf8" },
);
const payload = JSON.parse(stdout) as Array<{ results?: Array<Record<string, number>> }>;
const row = payload[0]?.results?.[0];
if (!row) throw new Error(`无法读取 D1 验证结果：${stdout}`);
const expected = ["domains", "listings", "public_domains"] as const;
const mismatches = expected.filter((key) => row[key] !== EXPECTED_DOMAIN_COUNT);
if (row.has_wanmi_org !== 1 || row.has_02cloud !== 1) mismatches.push("domains");
if (mismatches.length > 0) throw new Error(`D1 域名验收失败：${JSON.stringify(row)}`);
console.log(`D1 验证通过：域名 ${row.domains}，市场记录 ${row.listings}，公开展示 ${row.public_domains}。`);
