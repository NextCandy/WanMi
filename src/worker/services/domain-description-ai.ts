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
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface ResponsesApiResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

export type AiApiProtocol = "chat_completions" | "responses";

export interface AiEndpoint {
  protocol: AiApiProtocol;
  url: string;
}

export function buildDomainDescriptionPrompt(template: string, input: DomainDescriptionInput): string {
  const values: Record<string, string> = {
    domain: input.domain,
    tld: input.tld.replace(/^\./, ""),
    length: String(input.length),
    type: input.type || "未分类",
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

export function resolveAiEndpoint(baseUrl: string): AiEndpoint {
  const url = baseUrl.replace(/\/+$/, "");
  if (/\/responses$/i.test(url)) return { protocol: "responses", url };
  if (/\/chat\/completions$/i.test(url)) return { protocol: "chat_completions", url };
  return { protocol: "chat_completions", url: `${url}/chat/completions` };
}

function extractAiResponseText(body: ChatCompletionResponse & ResponsesApiResponse): string {
  const chatText = body.choices?.[0]?.message?.content;
  if (chatText) return chatText;
  if (body.output_text) return body.output_text;
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.text) return content.text;
    }
  }
  return "";
}

function requestBody(protocol: AiApiProtocol, model: string, prompt: string): Record<string, unknown> {
  if (protocol === "responses") {
    return {
      model,
      input: prompt,
      max_output_tokens: 180,
      stream: false,
    };
  }
  return {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 180,
    stream: false,
  };
}

function requestFailure(status: number): Error {
  if (status === 400 || status === 404 || status === 422) return new Error("接口地址、模型或请求协议不匹配");
  if (status === 401 || status === 403) return new Error("AI 服务拒绝访问，请检查 API Key");
  if (status === 429) return new Error("AI 服务请求过于频繁，请稍后重试");
  if (status >= 500) return new Error("AI 服务暂时不可用，请稍后重试");
  return new Error(`AI 服务返回 HTTP ${status}`);
}

export async function generateDomainDescription(
  config: AiConfigRow,
  input: DomainDescriptionInput,
  encryptionKey: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!config.api_key_encrypted || !config.api_key_iv) throw new Error("当前 AI 配置尚未填写 API Key");
  let credentials: Awaited<ReturnType<typeof decryptCredentials>>;
  try {
    credentials = await decryptCredentials(config.api_key_encrypted, config.api_key_iv, encryptionKey);
  } catch (error) {
    throw new Error("无法读取当前 AI 配置的 API Key，请重新保存配置", { cause: error });
  }
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error("当前 AI 配置的 API Key 无效");
  const prompt = buildDomainDescriptionPrompt(config.prompt_template, input);
  const endpoint = resolveAiEndpoint(config.base_url);
  let response: Response;
  try {
    response = await fetcher(endpoint.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody(endpoint.protocol, config.model, prompt)),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|timed out/i.test(message)) throw new Error("AI 服务响应超时，请稍后重试", { cause: error });
    throw new Error("无法连接 AI 服务，请检查接口地址", { cause: error });
  }
  if (!response.ok) throw requestFailure(response.status);
  let body: ChatCompletionResponse & ResponsesApiResponse;
  try {
    body = await response.json();
  } catch {
    throw new Error("AI 服务响应格式无法识别");
  }
  return extractDomainDescription(extractAiResponseText(body));
}
