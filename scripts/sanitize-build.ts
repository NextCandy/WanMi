import fs from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const localVarsPath = path.resolve(".dev.vars");
const secretValues: string[] = [];

try {
  const vars = await fs.readFile(localVarsPath, "utf8");
  for (const line of vars.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) {
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (value.length >= 8) secretValues.push(value);
    }
  }
} catch {
  // CI 构建通常没有本地 Secret 文件。
}

async function visit(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await visit(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const files = await visit(dist);
for (const file of files) {
  const basename = path.basename(file);
  if (basename === ".DS_Store" || basename === "Thumbs.db" || basename.startsWith(".dev.vars") || basename === ".env" || basename.startsWith(".env.")) {
    await fs.rm(file, { force: true });
  }
}

const sanitizedFiles = await visit(dist);
const leaks: string[] = [];
for (const file of sanitizedFiles) {
  if (!/\.(?:js|json|html|css|map|txt)$/i.test(file)) continue;
  const content = await fs.readFile(file, "utf8");
  if (secretValues.some((value) => content.includes(value))) leaks.push(path.relative(process.cwd(), file));
}
if (leaks.length > 0) throw new Error(`构建产物包含本地 Secret：${leaks.join("、")}`);
console.log(`构建安全检查通过：${sanitizedFiles.length} 个产物文件未发现本地 Secret。`);
