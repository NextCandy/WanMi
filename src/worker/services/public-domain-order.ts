const DEFAULT_TLD_PRIORITY = ["com", "cn", "net", "org", "io", "is", "do"] as const;

/**
 * 公共目录默认顺序：精品优先，其次按指定后缀分组，每组短域名优先。
 * tableAlias 只由内部固定调用传入，不接收请求参数。
 */
export function publicDefaultOrderSql(tableAlias?: string): string {
  const column = (name: string) => tableAlias ? `${tableAlias}.${name}` : name;
  const tldPriority = DEFAULT_TLD_PRIORITY
    .map((tld, index) => `WHEN '${tld}' THEN ${index}`)
    .join(" ");

  return `${column("is_featured")} DESC, CASE lower(${column("tld")}) ${tldPriority} ELSE ${DEFAULT_TLD_PRIORITY.length} END ASC, length(${column("name")}) ASC, ${column("normalized_domain")} ASC`;
}
