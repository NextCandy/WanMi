import { describe, expect, it } from "vitest";

import {
  buildDomainKeywordPrompt,
  DOMAIN_KEYWORDS_MODEL,
  extractDomainKeywordSuggestion,
} from "../../src/worker/services/domain-keywords-ai";

describe("域名关键词 AI 辅助", () => {
  it("使用仍受支持的 Llama 3.1 快速模型并生成完整中文提示词", () => {
    expect(DOMAIN_KEYWORDS_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct-fast");
    expect(buildDomainKeywordPrompt({ domain: "02cloud.com", tld: "com", length: 7, type: "杂米" })).toBe(
      "你是域名价值分析师。给定域名「02cloud.com」（后缀 .com，7字符，类型 杂米），请给出 2-4 个最能体现该域名商业价值或品牌含义的中文关键词，用逗号分隔，只输出关键词本身，不要解释。",
    );
  });

  it("从常见模型输出中提取、去重并限制为四个中文关键词", () => {
    expect(extractDomainKeywordSuggestion("关键词：1. 云服务，2. 品牌\n未来、品牌、第五")).toEqual([
      "云服务",
      "品牌",
      "未来",
      "第五",
    ]);
  });

  it("过滤无中文含义和过长内容", () => {
    expect(extractDomainKeywordSuggestion(`cloud,品牌,${"长".repeat(41)},模型`)).toEqual(["品牌", "模型"]);
  });
});
