import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * 拉取自托管字体的 latin/latin-ext 子集并生成 src/client/styles/fonts.css。
 *
 * 为什么自托管：Google Fonts 在中国大陆不可达，外链会让国内用户完全拿不到 Manrope
 * （域名展示的主字体）与 IBM Plex Mono（元数据），只能回退系统字体。
 * 为什么只取 latin/latin-ext：域名与 UI 英文数字只用这两个子集；中文体积过大不宜自托管，
 * 仍由 Noto Sans SC 与 tokens.css 的系统字体栈承担。
 *
 * 需要更新字体版本时重跑：pnpm fonts:fetch
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const OUT_DIR = "public/fonts";
const CSS_PATH = "src/client/styles/fonts.css";

// Node 的 fetch 不读 HTTP_PROXY 环境变量，本机走代理时会 ECONNRESET；统一用 curl
function curlText(url: string): string {
  return execFileSync("curl", ["-sSL", "-A", UA, url], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function curlBuffer(url: string): Buffer {
  return execFileSync("curl", ["-sSL", "-A", UA, url], { maxBuffer: 32 * 1024 * 1024 });
}

const WANTED = new Set(["latin", "latin-ext"]);
const FAMILIES = [
  { name: "Manrope", query: "Manrope:wght@400..800", slug: "manrope" },
  { name: "IBM Plex Mono", query: "IBM+Plex+Mono:wght@400;500;600", slug: "ibm-plex-mono" },
  // display 字体：域名大标题与统计数字；另需一份 TTF 供 og.ts 生成 OG 图（见下方 EXTRA_TTF）
  { name: "Cormorant Garamond", query: "Cormorant+Garamond:wght@400;600", slug: "cormorant-garamond" },
];

// OG 图渲染（resvg）吃 TTF；google/fonts 仓库只有 1.1MB 变量字体，
// 改用旧版 UA 请求 css2 拿 gstatic 的静态 Regular（约 290KB）
const EXTRA_TTF = [
  {
    cssUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400",
    fileName: "CormorantGaramond-Regular.ttf",
  },
];

interface Face {
  family: string;
  weight: string;
  range: string;
  fileName: string;
  bytes: number;
}

mkdirSync(OUT_DIR, { recursive: true });
const faces: Face[] = [];

for (const family of FAMILIES) {
  const css = curlText(`https://fonts.googleapis.com/css2?family=${family.query}&display=swap`);
  // Google 在每个 @font-face 前用注释标注子集名
  for (const block of css.split("/*").slice(1)) {
    const subset = block.slice(0, block.indexOf("*/")).trim();
    if (!WANTED.has(subset)) continue;
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const weight = block.match(/font-weight:\s*([^;]+);/)?.[1].trim();
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
    if (!url || !weight || !range) continue;

    const fileName = `${family.slug}-${subset}-${weight.replace(/\s+/g, "-")}.woff2`;
    const buf = curlBuffer(url);
    if (buf.length < 1024) throw new Error(`${fileName} 下载异常，仅 ${buf.length} 字节`);
    writeFileSync(`${OUT_DIR}/${fileName}`, buf);
    faces.push({ family: family.name, weight, range, fileName, bytes: buf.length });
    console.log(`${fileName.padEnd(44)} ${(buf.length / 1024).toFixed(1)} KB`);
  }
}

if (faces.length === 0) throw new Error("未取到任何字体，请检查网络或 Google Fonts 响应格式");

const header = `/* 自托管字体子集，由 pnpm fonts:fetch 生成，请勿手改。

   Google Fonts 在中国大陆不可达，外链会让国内用户完全拿不到 Manrope（域名展示的主字体）
   与 IBM Plex Mono（元数据）。只自托管 latin/latin-ext 子集：Manrope 为变量字体，单文件
   覆盖 400-800；浏览器按 unicode-range 只下载命中的子集。中文仍由 Noto Sans SC 与
   tokens.css 的系统字体栈承担。

   Instrument Serif（--font-display）的 @font-face 另在 app.css 顶部，与本文件无关。
   字体均为 SIL Open Font License，许可证随字体存放于 public/fonts/。 */

`;

const css = header + faces.map((f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${f.fileName}') format('woff2');
  unicode-range: ${f.range};
}`).join("\n\n") + "\n";

writeFileSync(CSS_PATH, css, "utf8");
for (const extra of EXTRA_TTF) {
  // 不带现代 UA 时 Google Fonts 返回 truetype 源
  const css = execFileSync("curl", ["-sSL", "-A", "curl/7.0", extra.cssUrl], { encoding: "utf8" });
  const ttfUrl = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
  if (!ttfUrl) throw new Error(`${extra.fileName} 未取到 TTF 源`);
  const buf = curlBuffer(ttfUrl);
  if (buf.length < 10 * 1024) throw new Error(`${extra.fileName} 下载异常，仅 ${buf.length} 字节`);
  writeFileSync(`${OUT_DIR}/${extra.fileName}`, buf);
  console.log(`${extra.fileName.padEnd(44)} ${(buf.length / 1024).toFixed(1)} KB [og 专用 TTF]`);
}

console.log(`\n合计 ${faces.length} 个文件、${(faces.reduce((s, f) => s + f.bytes, 0) / 1024).toFixed(1)} KB`);
console.log(`已生成 ${CSS_PATH}`);
