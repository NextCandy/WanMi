import { AliyunProvider } from "./aliyun";
import { CloudflareProvider } from "./cloudflare";
import { DnsPodProvider } from "./dnspod";
import { GoDaddyProvider } from "./godaddy";
import { NameSiloProvider } from "./namesilo";
import { PorkbunProvider } from "./porkbun";
import { ProviderError, type RegistrarProvider } from "./types";

export const PROVIDER_NAMES = ["cloudflare", "godaddy", "namesilo", "porkbun", "dnspod", "aliyun"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function createProvider(provider: string, credentials: Record<string, string>): RegistrarProvider {
  switch (provider.toLowerCase()) {
    case "cloudflare": return new CloudflareProvider(credentials);
    case "godaddy": return new GoDaddyProvider(credentials);
    case "namesilo": return new NameSiloProvider(credentials);
    case "porkbun": return new PorkbunProvider(credentials);
    case "dnspod": return new DnsPodProvider(credentials);
    case "aliyun": return new AliyunProvider(credentials);
    default: throw new ProviderError(`不支持注册商 ${provider}`, "PROVIDER_UNSUPPORTED", 422);
  }
}
