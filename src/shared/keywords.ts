const KEYWORD_SEPARATOR = /[,，、]/u;

export function parseKeywords(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of value.split(KEYWORD_SEPARATOR)) {
    const keyword = part.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

export function serializeKeywords(value: string | string[]): string {
  const parts = Array.isArray(value) ? value.flatMap((item) => parseKeywords(item)) : parseKeywords(value);
  return parseKeywords(parts.join(",")).join(",");
}
