import { parseKeywords } from "../../shared/keywords";

// 原模型已被 Cloudflare 弃用；使用仍受支持的同系列快速版本。
export const DOMAIN_KEYWORDS_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast" as const;

interface DomainKeywordPromptInput {
  domain: string;
  tld: string;
  length: number;
  type: string;
}

export function buildDomainKeywordPrompt(input: DomainKeywordPromptInput): string {
  return `你是域名价值分析师。给定域名「${input.domain}」（后缀 .${input.tld.replace(/^\./, "")}，${input.length}字符，类型 ${input.type}），请给出 2-4 个最能体现该域名商业价值或品牌含义的中文关键词，用逗号分隔，只输出关键词本身，不要解释。`;
}

export function extractDomainKeywordSuggestion(value: string): string[] {
  const normalized = value
    .replace(/\r?\n/gu, ",")
    .replace(/[；;|/]+/gu, ",")
    .replace(/^[\s"'`“”‘’]*(?:关键词(?:是|为)?\s*[:：]?\s*)?/u, "");
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of parseKeywords(normalized)) {
    const keyword = part
      .replace(/^(?:[-*•·]\s*|\d+\s*[.、)）]\s*)/u, "")
      .replace(/[\s"'`“”‘’。，；;.!！?？:：]+$/gu, "")
      .trim();
    if (!keyword || keyword.length > 40 || !/\p{Script=Han}/u.test(keyword) || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
    if (keywords.length === 4) break;
  }
  return keywords;
}
