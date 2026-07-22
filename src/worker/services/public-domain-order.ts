const DEFAULT_TLD_PRIORITY = ["com", "cn", "net", "org", "io", "is", "do"] as const;

/**
 * 公共目录默认顺序：精品优先，两组各按各的规则排——
 * 精品组只看位数（短的在前），普通组只看后缀（按上面的业务优先级分组）。
 *
 * 两个 CASE 都用 is_featured 兜住：不属于本组的行返回 NULL，而 is_featured DESC
 * 已经把两组彻底分开，因此各自的 NULL 不会干扰另一组的组内次序。
 * tableAlias 只由内部固定调用传入，不接收请求参数。
 */
export function publicDefaultOrderSql(tableAlias?: string): string {
  const column = (name: string) => tableAlias ? `${tableAlias}.${name}` : name;
  const tldPriority = DEFAULT_TLD_PRIORITY
    .map((tld, index) => `WHEN '${tld}' THEN ${index}`)
    .join(" ");
  const tldRank = `CASE lower(${column("tld")}) ${tldPriority} ELSE ${DEFAULT_TLD_PRIORITY.length} END`;

  return [
    `${column("is_featured")} DESC`,
    `CASE WHEN ${column("is_featured")} = 1 THEN length(${column("name")}) END ASC`,
    `CASE WHEN ${column("is_featured")} = 0 THEN ${tldRank} END ASC`,
    `${column("normalized_domain")} ASC`,
  ].join(", ");
}
