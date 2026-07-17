import { describe, expect, it } from "vitest";

import { getSimilarDomainGroups, getSimilarDomains } from "../../src/client/lib/domain-discovery";
import type { PublicDomain } from "../../src/shared/types/api";

function domain(id: number, value: string, categories: string[] = [], featured = false): PublicDomain {
  const [name, ...tldParts] = value.split(".");
  return {
    id,
    domain: value,
    name,
    tld: tldParts.join("."),
    description: "",
    category: categories[0] ?? null,
    categories,
    is_featured: featured,
    registered_at: null,
    expires_at: null,
  };
}

describe("相似域名推荐", () => {
  it("优先同后缀、同分类和相近长度，并排除当前域名与重复项", () => {
    const source = domain(1, "wanmi.org", ["拼音"], true);
    const sameTld = domain(2, "wanmei.org", ["拼音"], true);
    const sameCategory = domain(3, "wanmi.cn", ["拼音"]);
    const unrelated = domain(4, "123456.com", ["数字"]);
    expect(getSimilarDomains(source, [source, sameTld, sameCategory, unrelated, sameTld], 3).map((item) => item.id))
      .toEqual([2, 3, 4]);
  });

  it("分别返回最多五个同后缀和同长度域名", () => {
    const source = domain(1, "yu.org", ["拼音"]);
    const candidates = [
      domain(2, "ai.org"),
      domain(3, "mi.org"),
      domain(4, "an.org"),
      domain(5, "fu.org"),
      domain(6, "ji.org"),
      domain(7, "qi.org"),
      domain(8, "yu.com"),
      domain(9, "88.net"),
    ];
    const groups = getSimilarDomainGroups(source, [source, ...candidates, candidates[0]]);

    expect(groups.sameTld).toHaveLength(5);
    expect(groups.sameTld.every((item) => item.tld === "org")).toBe(true);
    expect(groups.sameLength).toHaveLength(5);
    expect(groups.sameLength.every((item) => item.name.length === 2)).toBe(true);
    expect(new Set(groups.sameTld.map((item) => item.id)).size).toBe(5);
  });
});
