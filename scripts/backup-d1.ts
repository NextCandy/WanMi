import { mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outputDirectory = join(process.cwd(), "backups");
const outputPath = join(outputDirectory, `wanmi-${stamp}.sql`);

mkdirSync(outputDirectory, { recursive: true });

const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint) throw new Error("无法定位当前 pnpm 入口，请通过 pnpm db:backup 运行此脚本");
const result = spawnSync(
  process.execPath,
  [pnpmEntrypoint, "exec", "wrangler", "d1", "export", "wanmi-db", "--remote", `--output=${outputPath}`],
  { stdio: "inherit", env: process.env },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (statSync(outputPath).size === 0) throw new Error("D1 备份文件为空");

console.log(`D1 备份已写入 ${outputPath}`);
