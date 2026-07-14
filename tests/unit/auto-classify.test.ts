import { describe, expect, it } from "vitest";

import { classifyDomain, classifyDomainName, pinyinSyllableCount } from "../../src/shared/auto-classify";

describe("域名自动分类", () => {
  it("识别纯字母与拼音音节", () => {
    expect(classifyDomainName("wan")).toEqual(["纯字母", "拼音", "单拼"]);
    expect(classifyDomainName("wanmi")).toEqual(["纯字母", "拼音", "双拼"]);
    expect(classifyDomainName("wanmijia")).toEqual(["纯字母", "拼音", "三拼"]);
    expect(pinyinSyllableCount("xyz")).toBeNull();
  });

  it("输出一级分类、内部子类与置信度", () => {
    expect(classifyDomain("88888888")).toMatchObject({ primary: "数字", subtype: "num8" });
    expect(classifyDomain("wanmi")).toMatchObject({ primary: "拼音", subtype: "pinyin2" });
    expect(classifyDomain("cloud")).toMatchObject({ primary: "英文", subtype: "english" });
    expect(classifyDomain("xyz")).toMatchObject({ primary: "字母", subtype: "alpha3" });
    expect(classifyDomain("a8-b")).toMatchObject({ primary: "杂米", subtype: "mixed3" });
    expect(classifyDomain("xn--fsqu00a")).toMatchObject({ primary: "其他" });
  });

  it("识别纯数字及长度分类", () => {
    expect(classifyDomainName("888")).toEqual(["纯数字", "三数字"]);
    expect(classifyDomainName("123456")).toEqual(["纯数字", "六数字"]);
    expect(classifyDomainName("88")).toEqual(["纯数字"]);
    expect(classifyDomainName("8a8")).toEqual(["杂米", "二杂"]);
    expect(classifyDomainName("123456789")).toEqual(["纯数字", "九数字"]);
  });

  it("覆盖四拼、字母与杂米子类", () => {
    expect(classifyDomainName("wanmijiale")).toEqual(["纯字母", "拼音", "四拼"]);
    expect(classifyDomainName("xyz")).toEqual(["纯字母", "三字母"]);
    expect(classifyDomainName("a8")).toEqual(["杂米", "二杂"]);
    expect(classifyDomainName("a8-b")).toEqual(["杂米", "三杂"]);
  });
});
