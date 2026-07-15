import { Fragment, type ReactNode } from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 把 text 中命中搜索词的片段包成 <mark>，通过 React 节点安全拆分。
 * —— 不使用 dangerouslySetInnerHTML，天然免疫 XSS；
 * —— 不改动原始文本，复制 / 链接 / 读屏读到的仍是完整域名；
 * —— 支持带点的完整域名查询（如 wanmi.org）：拆成词元逐一高亮。
 */
export function highlightText(text: string, query: string | undefined): ReactNode {
  const trimmed = (query ?? "").trim();
  if (!trimmed || !text) return text;
  const tokens = Array.from(
    new Set(
      [trimmed, ...trimmed.split(/[.\s]+/)]
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 1),
    ),
  ).sort((left, right) => right.length - left.length);
  if (!tokens.length) return text;

  let pattern: RegExp;
  try {
    pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  } catch {
    return text;
  }

  // String.split 携带捕获组时，命中片段落在奇数下标；原始大小写被保留。
  const segments = text.split(pattern);
  if (segments.length <= 1) return text;
  return segments.map((segment, index) =>
    segment
      ? index % 2 === 1
        ? <mark className="search-hl" key={index}>{segment}</mark>
        : <Fragment key={index}>{segment}</Fragment>
      : null,
  );
}
