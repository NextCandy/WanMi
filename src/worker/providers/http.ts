import { ProviderError } from "./types";

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;
  if (!response.ok) {
    const detail = body && typeof body === "object" && "message" in body ? body.message : null;
    throw new ProviderError(`${provider} API 请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ""}`);
  }
  if (body === null) throw new ProviderError(`${provider} API 返回了无效 JSON`);
  return body as T;
}

export function requiredCredential(credentials: Record<string, string>, key: string, provider: string): string {
  const value = credentials[key]?.trim();
  if (!value) throw new ProviderError(`${provider} 凭据缺少 ${key}`, "PROVIDER_CREDENTIALS_INVALID", 422);
  return value;
}
