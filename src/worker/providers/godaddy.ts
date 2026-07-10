import { fetchJson, requiredCredential } from "./http";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface GoDaddyDomain { domain: string; status?: string; expires?: string; }
interface GoDaddyRecord { type: string; name: string; data: string; ttl?: number; priority?: number; }

export class GoDaddyProvider implements RegistrarProvider {
  readonly provider = "godaddy";
  private readonly authorization: string;
  private readonly base: string;

  constructor(credentials: Record<string, string>) {
    const key = requiredCredential(credentials, "apiKey", "GoDaddy");
    const secret = requiredCredential(credentials, "apiSecret", "GoDaddy");
    this.authorization = `sso-key ${key}:${secret}`;
    this.base = credentials.environment === "ote" ? "https://api.ote-godaddy.com" : "https://api.godaddy.com";
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return fetchJson<T>(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: this.authorization, "Content-Type": "application/json", Accept: "application/json", ...init.headers },
    }, "GoDaddy");
  }

  async testConnection() {
    await this.request<GoDaddyDomain[]>("/v1/domains?limit=1");
    return { ok: true as const, message: "GoDaddy API 凭据有效" };
  }

  async listDomains(): Promise<RegistrarDomain[]> {
    const domains = await this.request<GoDaddyDomain[]>("/v1/domains?limit=1000");
    return domains.map((item) => ({ domain: item.domain, status: item.status ?? null, expiresAt: item.expires ? new Date(item.expires).toISOString() : null }));
  }

  private identifier(type: string, name: string, index: number): string {
    return encodeURIComponent(`${type}|${name}|${index}`);
  }

  private parseIdentifier(recordId: string): { type: string; name: string; index: number } {
    const [type, name, index] = decodeURIComponent(recordId).split("|");
    if (!type || name === undefined || !/^\d+$/.test(index ?? "")) throw new ProviderError("GoDaddy DNS 记录 ID 无效", "DNS_RECORD_ID_INVALID", 422);
    return { type, name, index: Number(index) };
  }

  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const records = await this.request<GoDaddyRecord[]>(`/v1/domains/${encodeURIComponent(domain)}/records`);
    const counters = new Map<string, number>();
    return records.filter((record) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].includes(record.type)).map((record) => {
      const group = `${record.type}|${record.name}`;
      const index = counters.get(group) ?? 0;
      counters.set(group, index + 1);
      return { id: this.identifier(record.type, record.name, index), type: assertRecordType(record.type), name: record.name, content: record.data, ttl: record.ttl ?? null, priority: record.priority ?? null, proxied: null };
    });
  }

  private toApi(input: DnsRecordInput): GoDaddyRecord {
    return { type: input.type, name: input.name || "@", data: input.content, ttl: input.ttl ?? 600, ...(input.priority === null || input.priority === undefined ? {} : { priority: input.priority }) };
  }

  private async replaceGroup(domain: string, type: string, name: string, records: GoDaddyRecord[]): Promise<void> {
    const response = await fetch(`${this.base}/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { Authorization: this.authorization, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(records.map(({ data, ttl, priority }) => ({ data, ttl, ...(priority === undefined ? {} : { priority }) }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new ProviderError(`GoDaddy DNS 更新失败（HTTP ${response.status}）`);
  }

  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> {
    const name = input.name || "@";
    const existing = (await this.request<GoDaddyRecord[]>(`/v1/domains/${encodeURIComponent(domain)}/records/${input.type}/${encodeURIComponent(name)}`).catch(() => []));
    const record = this.toApi(input);
    await this.replaceGroup(domain, input.type, name, [...existing, record]);
    return { id: this.identifier(input.type, name, existing.length), type: input.type, name, content: input.content, ttl: record.ttl ?? null, priority: record.priority ?? null, proxied: null };
  }

  async updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> {
    const id = this.parseIdentifier(recordId);
    if (id.type !== input.type || id.name !== (input.name || "@")) throw new ProviderError("GoDaddy 不支持在更新时改变记录类型或主机名，请删除后重建", "DNS_RECREATE_REQUIRED", 422);
    const records = await this.request<GoDaddyRecord[]>(`/v1/domains/${encodeURIComponent(domain)}/records/${id.type}/${encodeURIComponent(id.name)}`);
    if (!records[id.index]) throw new ProviderError("GoDaddy DNS 记录不存在", "DNS_RECORD_NOT_FOUND", 404);
    records[id.index] = this.toApi(input);
    await this.replaceGroup(domain, id.type, id.name, records);
    const record = records[id.index];
    return { id: recordId, type: input.type, name: id.name, content: record.data, ttl: record.ttl ?? null, priority: record.priority ?? null, proxied: null };
  }

  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    const id = this.parseIdentifier(recordId);
    const records = await this.request<GoDaddyRecord[]>(`/v1/domains/${encodeURIComponent(domain)}/records/${id.type}/${encodeURIComponent(id.name)}`);
    if (!records[id.index]) throw new ProviderError("GoDaddy DNS 记录不存在", "DNS_RECORD_NOT_FOUND", 404);
    records.splice(id.index, 1);
    await this.replaceGroup(domain, id.type, id.name, records);
  }
}
