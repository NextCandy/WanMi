import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_DOMAIN_DESCRIPTION_PROMPT,
} from "../../src/shared/ai-config";
import { aiConfigCreateSchema } from "../../src/shared/schemas/api";
import { encryptCredentials } from "../../src/worker/security/crypto";
import {
  buildDomainDescriptionPrompt,
  extractDomainDescription,
  generateDomainDescription,
  type AiConfigRow,
} from "../../src/worker/services/domain-description-ai";

const encryptionKey = Buffer.alloc(32, 13).toString("base64");

async function configuredRow(): Promise<AiConfigRow> {
  const encrypted = await encryptCredentials({ apiKey: "sk-unit-secret" }, encryptionKey);
  return {
    id: "deepseek-default",
    name: "DeepSeek 默认配置",
    provider: "deepseek",
    base_url: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
    prompt_template: DEFAULT_DOMAIN_DESCRIPTION_PROMPT,
    api_key_encrypted: encrypted.encrypted,
    api_key_iv: encrypted.iv,
    is_active: 1,
    created_at: "2026-07-16 00:00:00",
    updated_at: "2026-07-16 00:00:00",
  };
}

describe("域名简介 AI 服务", () => {
  it("使用 DeepSeek V4 Flash 默认配置并替换全部简介变量", () => {
    expect(DEFAULT_AI_MODEL).toBe("deepseek-v4-flash");
    const prompt = buildDomainDescriptionPrompt(DEFAULT_DOMAIN_DESCRIPTION_PROMPT, {
      domain: "02cloud.com",
      tld: "com",
      length: 7,
      type: "杂米",
      keywords: ["云服务", "品牌"],
    });
    expect(prompt).toContain("域名「02cloud.com」");
    expect(prompt).toContain("后缀：com");
    expect(prompt).toContain("主体长度：7");
    expect(prompt).toContain("类型：杂米");
    expect(prompt).toContain("关键词：云服务、品牌");
  });

  it("清理模型包装文本并拒绝没有中文内容的响应", () => {
    expect(extractDomainDescription("简介：\n“适合塑造云服务与数字品牌形象的简洁域名。”")).toBe("适合塑造云服务与数字品牌形象的简洁域名。");
    expect(() => extractDomainDescription("cloud brand only")).toThrow("AI 未返回有效的中文简介");
  });

  it("配置接口只接受公开 HTTPS 地址", () => {
    const base = { name: "测试", provider: "deepseek" as const, model: DEFAULT_AI_MODEL, apiKey: "sk-test-only", promptTemplate: DEFAULT_DOMAIN_DESCRIPTION_PROMPT };
    expect(aiConfigCreateSchema.safeParse({ ...base, baseUrl: DEFAULT_AI_BASE_URL }).success).toBe(true);
    expect(aiConfigCreateSchema.safeParse({ ...base, baseUrl: "http://localhost:11434/v1" }).success).toBe(false);
    expect(aiConfigCreateSchema.safeParse({ ...base, baseUrl: "https://192.168.1.8/v1" }).success).toBe(false);
    expect(aiConfigCreateSchema.safeParse({ ...base, baseUrl: "https://[::1]/v1" }).success).toBe(false);
  });

  it("通过 OpenAI 兼容接口发送加密凭据且只返回简介正文", async () => {
    const config = await configuredRow();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.href : _input.url;
      expect(url).toBe("https://api.deepseek.com/chat/completions");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-unit-secret");
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { model: string; messages: Array<{ content: string }> };
      expect(body.model).toBe("deepseek-v4-flash");
      expect(body.messages[0].content).toContain("02cloud.com");
      return Response.json({ choices: [{ message: { content: "面向云计算与数字服务场景，名称简洁易记，兼具科技感与品牌延展空间。" } }] });
    });
    await expect(generateDomainDescription(config, {
      domain: "02cloud.com",
      tld: "com",
      length: 7,
      type: "杂米",
      keywords: [],
    }, encryptionKey, fetcher as typeof fetch)).resolves.toContain("品牌延展空间");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
