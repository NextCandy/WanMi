/**
 * 由本地 TTF 生成 public/fonts 下的品牌字体子集。
 *
 * 与 fetch-fonts.ts 分开：那份从 Google Fonts 抓取 OFL 字体，这份处理站点所有者
 * 自行提供的字体文件（仓耳华新体为商业授权字体，不进仓库、不对外分发原始 TTF）。
 *
 * 中文全字库 28565 字、17MB，直接上线不可接受。这里按「源码里出现的汉字 +
 * GB2312 一级字库 3755 常用字 + 常用标点」子集化到约 800KB，运行时若出现子集外的
 * 生僻字，浏览器按 tokens.css 的字体栈回退系统中文字体，不会缺字。
 *
 * 用法（需要 Python 3 与 fonttools、brotli）：
 *   pnpm fonts:brand -- --cjk "C:\\path\\仓耳华新体.ttf" --latin "C:\\path\\AveriaSerifLibre-Light.ttf"
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const OUT_DIR = join(process.cwd(), "public", "fonts");
const CHARSET_FILE = join(OUT_DIR, ".cjk-charset.txt");

const LATIN_UNICODES = [
  "U+0000-00FF", "U+0131", "U+0152-0153", "U+02BB-02BC", "U+02C6", "U+02DA", "U+02DC",
  "U+0304", "U+0308", "U+0329", "U+2000-206F", "U+2074", "U+20AC", "U+2122", "U+2191",
  "U+2193", "U+2212", "U+2215", "U+FEFF", "U+FFFD",
].join(",");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 扫描源码收集实际用到的汉字，再并上 GB2312 一级字库兜底运行时内容 */
function buildCharset(): string {
  const python = `
import io, glob, sys
chars = set()
for pat in ["src/**/*.ts", "src/**/*.tsx", "index.html", "migrations/*.sql"]:
    for f in glob.glob(pat, recursive=True):
        try:
            s = io.open(f, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        for ch in s:
            if '\\u4e00' <= ch <= '\\u9fff' or '\\u3000' <= ch <= '\\u303f' or '\\uff00' <= ch <= '\\uffef':
                chars.add(ch)
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except Exception:
            pass
// 全角空格用转义写，避免源码里出现 no-irregular-whitespace 会报的裸字符
chars |= set("\\u3000" + "、。〈〉《》「」『』【】〔〕！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～￥·—…‘’“”")
sys.stdout.write("".join(sorted(chars)))
`;
  return execFileSync("python", ["-c", python], { encoding: "utf-8", maxBuffer: 8 << 20 });
}

function subset(input: string, output: string, extra: string[]): void {
  if (!existsSync(input)) throw new Error(`找不到字体文件：${input}`);
  execFileSync("python", [
    "-m", "fontTools.subset", input,
    `--output-file=${output}`,
    "--flavor=woff2",
    "--layout-features=*",
    "--no-hinting",
    ...extra,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  const kb = (statSync(output).size / 1024).toFixed(1);
  console.log(`  ${output.replace(process.cwd(), ".")} → ${kb} KB`);
}

const cjkSource = arg("cjk");
const latinSource = arg("latin");
if (!cjkSource && !latinSource) {
  console.error("用法：pnpm fonts:brand -- --cjk <中文TTF> --latin <拉丁TTF>");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

if (latinSource) {
  console.log("子集化拉丁字体…");
  subset(latinSource, join(OUT_DIR, "averia-serif-libre-light.woff2"), [`--unicodes=${LATIN_UNICODES}`]);
}

if (cjkSource) {
  console.log("收集汉字集…");
  const charset = buildCharset();
  writeFileSync(CHARSET_FILE, charset, "utf-8");
  console.log(`  ${[...new Set(charset)].length} 个字符`);
  console.log("子集化中文字体…");
  subset(cjkSource, join(OUT_DIR, "tsanger-huaxin-sc.woff2"), [
    `--text-file=${CHARSET_FILE}`,
    "--desubroutinize",
    "--name-IDs=*",
    "--drop-tables+=DSIG",
  ]);
  const before = (statSync(cjkSource).size / 1024 / 1024).toFixed(1);
  console.log(`  原始 ${before} MB → 子集见上`);
}

// 校验产物确实存在，避免 CI 里悄悄漏掉字体
for (const name of ["averia-serif-libre-light.woff2", "tsanger-huaxin-sc.woff2"]) {
  const path = join(OUT_DIR, name);
  if (!existsSync(path)) continue;
  const head = readFileSync(path).subarray(0, 4).toString("latin1");
  if (head !== "wOF2") throw new Error(`${name} 不是合法的 woff2`);
}
console.log("完成。");
