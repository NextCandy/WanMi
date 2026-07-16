import { decryptCredentials } from "../security/crypto";
import type { AiProvider } from "../../shared/ai-config";

export interface AiConfigRow {
  id: string;
  name: string;
  provider: AiProvider;
  base_url: string;
  model: string;
  prompt_template: string;
  api_key_encrypted: string | null;
  api_key_iv: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface DomainDescriptionInput {
  domain: string;
  tld: string;
  length: number;
  type: string;
  keywords: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export function buildDomainDescriptionPrompt(template: string, input: DomainDescriptionInput): string {
  const values: Record<string, string> = {
    domain: input.domain,
    tld: input.tld.replace(/^\./, ""),
    length: String(input.length),
    type: input.type || "未分类",
    keywords: input.keywords.length > 0 ? input.keywords.join("、") : "暂无",
  };
  return Object.entries(values).reduce((prompt, [key, value]) => prompt.replaceAll(`{${key}}`, value), template);
}

export function extractDomainDescription(value: string): string {
  const description = value
    .replace(/^(?:简介|域名简介|文案)\s*[:：]\s*/u, "")
    .replace(/^[“”‘’"']+|[“”‘’"']+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!description || !/\p{Script=Han}/u.test(description)) throw new Error("AI 未返回有效的中文简介");
  return description.slice(0, 500);
}

function chatCompletionUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export async function generateDomainDescription(
  config: AiConfigRow,
  input: DomainDescriptionInput,
  encryptionKey: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!config.api_key_encrypted || !config.api_key_iv) throw new Error("当前 AI 配置尚未填写 API Key");
  const credentials = await decryptCredentials(config.api_key_encrypted, config.api_key_iv, encryptionKey);
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error("当前 AI 配置的 API Key 无效");
  const prompt = buildDomainDescriptionPrompt(config.prompt_template, input);
  const response = await fetcher(chatCompletionUrl(config.base_url), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 180,
      stream: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("AI 服务拒绝访问，请检查 API Key");
    if (response.status === 429) throw new Error("AI 服务请求过于频繁，请稍后重试");
    throw new Error(`AI 服务返回 HTTP ${response.status}`);
  }
  const body: ChatCompletionResponse = await response.json();
  return extractDomainDescription(body.choices?.[0]?.message?.content ?? "");
}
