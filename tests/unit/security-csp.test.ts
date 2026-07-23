import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * index.html 里定主题的同步脚本靠 CSP 哈希放行。脚本内容一改哈希就失效，
 * 浏览器会静默拒绝执行，页面退回浅色——线上不报错、测试也不会自然发现。
 * 这里从两个真实文件里各自取值比对，把「改了脚本忘了改哈希」变成红测试。
 */
describe("CSP 主题脚本哈希", () => {
  const html = readFileSync("index.html", "utf8");
  const security = readFileSync("src/worker/middleware/security.ts", "utf8");

  it("index.html 只有一段内联脚本，且被 security.ts 的哈希覆盖", () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(inline).toHaveLength(1);

    const actual = `sha256-${createHash("sha256").update(inline[0], "utf8").digest("base64")}`;
    expect(security).toContain(`'${actual}'`);
  });

  it("哈希进入了 HTML 文档的 script-src，且没有顺带放开 unsafe-inline", () => {
    const scriptSrc = security.match(/script-src 'self'\$\{allowDevelopmentPreamble\} \$\{THEME_INIT_HASH\}/);
    expect(scriptSrc).not.toBeNull();
    // 'unsafe-inline' 只允许出现在按 hostname 判断的开发分支里
    const unsafeOccurrences = [...security.matchAll(/'unsafe-inline'/g)];
    const inScriptSrcLiteral = [...security.matchAll(/script-src[^`]*'unsafe-inline'/g)];
    expect(unsafeOccurrences.length).toBeGreaterThan(0);
    expect(inScriptSrcLiteral).toHaveLength(0);
  });
});
