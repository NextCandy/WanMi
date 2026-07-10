import { fetchJson, requiredCredential } from "./http";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface NameSiloReply {
  code?: string | number;
  detail?: string;
  domains?: Array<string | { domain?: string; expiration?: string; status?: string }>;
  resource_record?: NameSiloRecord | NameSiloRecord[];
  record_id?: string;
}
interface NameSiloEnvelope { reply?: NameSiloReply; }
interface NameSiloRecord { record_id: string; type: string; host: string; value: string; ttl?: string | number; distance?: string | number; }

export class NameSiloProvider implements RegistrarProvider {
  readonly provider = "namesilo";
  private readonly apiKey: string;
  private readonly base = "https://www.namesilo.com/api";
  private readonly supported = new Set(["A", "AAAA", "CNAME", "MX", "TXT"]);

  constructor(credentials: Record<string, string>) {
    this.apiKey = requiredCredential(credentials, "apiKey", "NameSilo");
  }

  private async request(operation: string, params: Record<string, string | number> = {}): Promise<NameSiloReply> {
    const query = new URLSearchParams({ version: "1", type: "json", key: this.apiKey });
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    const response = await fetchJson<NameSiloEnvelope>(`${this.base}/${operation}?${query}`, { headers: { Accept: "application/json" } }, "NameSilo");
    const reply = response.reply;
    if (!reply || Number(reply.code) !== 300) throw new ProviderError(`NameSilo API 失败：${reply?.detail ?? "无效响应"}`);
    return reply;
  }

  private assertSupported(type: string): void {
    if (!this.supported.has(type)) throw new ProviderError(`NameSilo API 不支持 ${type} 记录`, "DNS_TYPE_UNSUPPORTED", 422);
  }

  async testConnection() {
    await this.request("listDomains", { pageSize: 1 });
    return { ok: true as const, message: "NameSilo API 凭据有效" };
  }

  async listDomains(): Promise<RegistrarDomain[]> {
    const reply = await this.request("listDomains", { pageSize: 1000 });
    return (reply.domains ?? []).flatMap((item) => {
      if (typeof item === "string") return [{ domain: item, status: null, expiresAt: null }];
      if (!item.domain) return [];
      return [{ domain: item.domain, status: item.status ?? null, expiresAt: item.expiration ? new Date(`${item.expiration}T00:00:00Z`).toISOString() : null }];
    });
  }

  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const reply = await this.request("dnsListRecords", { domain });
    const value = reply.resource_record;
    const records = value ? (Array.isArray(value) ? value : [value]) : [];
    return records.filter((record) => this.supported.has(record.type)).map((record) => ({ id: record.record_id, type: assertRecordType(record.type), name: record.host === domain ? "@" : record.host.endsWith(`.${domain}`) ? record.host.slice(0, -(domain.length + 1)) : record.host, content: record.value, ttl: record.ttl === undefined ? null : Number(record.ttl), priority: record.distance === undefined ? null : Number(record.distance), proxied: null }));
  }

  private params(domain: string, input: DnsRecordInput): Record<string, string | number> {
    this.assertSupported(input.type);
    return { domain, rrtype: input.type, rrhost: input.name || "@", rrvalue: input.content, rrttl: input.ttl ?? 7207, rrdistance: input.priority ?? 0 };
  }

  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> {
    const reply = await this.request("dnsAddRecord", this.params(domain, input));
    if (!reply.record_id) throw new ProviderError("NameSilo 未返回 DNS 记录 ID");
    return { id: reply.record_id, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 7207, priority: input.priority ?? null, proxied: null };
  }

  async updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> {
    await this.request("dnsUpdateRecord", { ...this.params(domain, input), rrid: recordId });
    return { id: recordId, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 7207, priority: input.priority ?? null, proxied: null };
  }

  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    await this.request("dnsDeleteRecord", { domain, rrid: recordId });
  }
}
