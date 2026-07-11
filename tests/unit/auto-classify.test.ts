import { describe, expect, it } from "vitest";

import { classifyDomainName, pinyinSyllableCount } from "../../src/shared/auto-classify";

describe("域名自动分类", () => {
  it("识别纯字母与拼音音节", () => {
    expect(classifyDomainName("wan")).toEqual(["纯字母", "单拼"]);
    expect(classifyDomainName("wanmi")).toEqual(["纯字母", "双拼"]);
    expect(classifyDomainName("wanmijia")).toEqual(["纯字母", "三拼"]);
    expect(pinyinSyllableCount("xyz")).toBeNull();
  });

  it("识别纯数字及长度分类", () => {
    expect(classifyDomainName("888")).toEqual(["纯数字", "三数字"]);
    expect(classifyDomainName("123456")).toEqual(["纯数字", "六数字"]);
    expect(classifyDomainName("88")).toEqual(["纯数字"]);
    expect(classifyDomainName("8a8")).toEqual([]);
  });
});
