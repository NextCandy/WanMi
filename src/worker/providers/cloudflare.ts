import { fetchJson, requiredCredential } from "./http";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
  result_info?: { page?: number; total_pages?: number };
}

interface CloudflareZone { id: string; name: string; status?: string; }
interface CloudflareRecord { id: string; type: string; name: string; content: string; ttl?: number; priority?: number; proxied?: boolean; }

export class CloudflareProvider implements RegistrarProvider {
  readonly provider = "cloudflare";
  private readonly token: string;
  private readonly accountId: string | null;
  private readonly base = "https://api.cloudflare.com/client/v4";

  constructor(credentials: Record<string, string>) {
    this.token = requiredCredential(credentials, "apiToken", "Cloudflare");
    this.accountId = credentials.accountId?.trim() || null;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const body = await fetchJson<CloudflareEnvelope<T>>(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init.headers },
    }, "Cloudflare");
    if (!body.success) throw new ProviderError(`Cloudflare API 失败：${body.errors?.[0]?.message ?? "未知错误"}`);
    return body.result;
  }

  async testConnection() {
    await this.request<{ status: string }>("/user/tokens/verify");
    return { ok: true as const, message: "Cloudflare API Token 有效" };
  }

  async listDomains(): Promise<RegistrarDomain[]> {
    const zones: CloudflareZone[] = [];
    for (let page = 1; ; page += 1) {
      const account = this.accountId ? `&account.id=${encodeURIComponent(this.accountId)}` : "";
      const envelope = await fetchJson<CloudflareEnvelope<CloudflareZone[]>>(
        `${this.base}/zones?per_page=50&page=${page}${account}`,
        { headers: { Authorization: `Bearer ${this.token}` } },
        "Cloudflare",
      );
      if (!envelope.success) throw new ProviderError(`Cloudflare 域名列表失败：${envelope.errors?.[0]?.message ?? "未知错误"}`);
      zones.push(...envelope.result);
      if (page >= (envelope.result_info?.total_pages ?? 1)) break;
    }
    return zones.map((zone) => ({ domain: zone.name, status: zone.status ?? null, expiresAt: null }));
  }

  private async zone(domain: string): Promise<CloudflareZone> {
    const account = this.accountId ? `&account.id=${encodeURIComponent(this.accountId)}` : "";
    const zones = await this.request<CloudflareZone[]>(`/zones?name=${encodeURIComponent(domain)}${account}`);
    const zone = zones.find((item) => item.name.toLowerCase() === domain.toLowerCase());
    if (!zone) throw new ProviderError("Cloudflare 中未找到对应 Zone", "ZONE_NOT_FOUND", 404);
    return zone;
  }

  private recordName(domain: string, name: string): string {
    const trimmed = name.trim().replace(/\.$/, "");
    if (!trimmed || trimmed === "@") return domain;
    return trimmed.endsWith(`.${domain}`) ? trimmed : `${trimmed}.${domain}`;
  }

  private mapRecord(domain: string, record: CloudflareRecord): DnsRecord {
    const relative = record.name === domain ? "@" : record.name.endsWith(`.${domain}`) ? record.name.slice(0, -(domain.length + 1)) : record.name;
    return { id: record.id, type: assertRecordType(record.type), name: relative, content: record.content, ttl: record.ttl ?? null, priority: record.priority ?? null, proxied: record.proxied ?? null };
  }

  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const zone = await this.zone(domain);
    const records = await this.request<CloudflareRecord[]>(`/zones/${zone.id}/dns_records?per_page=5000`);
    return records.filter((record) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].includes(record.type)).map((record) => this.mapRecord(domain, record));
  }

  private payload(domain: string, input: DnsRecordInput) {
    return {
      type: input.type,
      name: this.recordName(domain, input.name),
      content: input.content,
      ttl: input.ttl ?? 1,
      ...(input.priority === null || input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.proxied === null || input.proxied === undefined ? {} : { proxied: input.proxied }),
    };
  }

  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> {
    const zone = await this.zone(domain);
    const record = await this.request<CloudflareRecord>(`/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(this.payload(domain, input)) });
    return this.mapRecord(domain, record);
  }

  async updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> {
    const zone = await this.zone(domain);
    const record = await this.request<CloudflareRecord>(`/zones/${zone.id}/dns_records/${encodeURIComponent(recordId)}`, { method: "PUT", body: JSON.stringify(this.payload(domain, input)) });
    return this.mapRecord(domain, record);
  }

  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    const zone = await this.zone(domain);
    await this.request(`/zones/${zone.id}/dns_records/${encodeURIComponent(recordId)}`, { method: "DELETE" });
  }
}
