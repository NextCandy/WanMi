import { fetchJson, requiredCredential } from "./http";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface PorkbunResponse { status?: string; message?: string; }
interface PorkbunDomain { domain: string; status?: string; expireDate?: string; }
interface PorkbunRecord { id: string | number; name: string; type: string; content: string; ttl?: string | number; prio?: string | number; }

export class PorkbunProvider implements RegistrarProvider {
  readonly provider = "porkbun";
  private readonly apiKey: string;
  private readonly secretApiKey: string;
  private readonly base = "https://api.porkbun.com/api/json/v3";

  constructor(credentials: Record<string, string>) {
    this.apiKey = requiredCredential(credentials, "apiKey", "Porkbun");
    this.secretApiKey = requiredCredential(credentials, "secretApiKey", "Porkbun");
  }

  private async request<T extends PorkbunResponse>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const response = await fetchJson<T>(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey, "X-Secret-API-Key": this.secretApiKey },
      body: JSON.stringify(body),
    }, "Porkbun");
    if (response.status && response.status !== "SUCCESS") throw new ProviderError(`Porkbun API 失败：${response.message ?? response.status}`);
    return response;
  }

  async testConnection() {
    await this.request("/ping");
    return { ok: true as const, message: "Porkbun API 凭据有效" };
  }

  async listDomains(): Promise<RegistrarDomain[]> {
    const all: PorkbunDomain[] = [];
    let start = 0;
    for (;;) {
      const response = await this.request<PorkbunResponse & { domains?: PorkbunDomain[] }>("/domain/listAll", { start: String(start), includeLabels: "no" });
      const page = response.domains ?? [];
      all.push(...page);
      if (page.length < 1000) break;
      start += page.length;
    }
    return all.map((item) => ({ domain: item.domain, status: item.status ?? null, expiresAt: item.expireDate ? new Date(`${item.expireDate}T00:00:00Z`).toISOString() : null }));
  }

  private mapRecord(domain: string, record: PorkbunRecord): DnsRecord {
    const name = record.name === domain ? "@" : record.name.endsWith(`.${domain}`) ? record.name.slice(0, -(domain.length + 1)) : record.name;
    return { id: String(record.id), type: assertRecordType(record.type), name, content: record.content, ttl: record.ttl === undefined ? null : Number(record.ttl), priority: record.prio === undefined || record.prio === "" ? null : Number(record.prio), proxied: null };
  }

  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const response = await this.request<PorkbunResponse & { records?: PorkbunRecord[] }>(`/dns/retrieve/${encodeURIComponent(domain)}`);
    return (response.records ?? []).filter((record) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].includes(record.type)).map((record) => this.mapRecord(domain, record));
  }

  private payload(input: DnsRecordInput) {
    return { name: input.name === "@" ? "" : input.name, type: input.type, content: input.content, ttl: String(input.ttl ?? 600), ...(input.priority === null || input.priority === undefined ? {} : { prio: String(input.priority) }) };
  }

  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> {
    const response = await this.request<PorkbunResponse & { id?: string | number }>(`/dns/create/${encodeURIComponent(domain)}`, this.payload(input));
    if (response.id === undefined) throw new ProviderError("Porkbun 未返回 DNS 记录 ID");
    return { id: String(response.id), type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null };
  }

  async updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> {
    await this.request(`/dns/edit/${encodeURIComponent(domain)}/${encodeURIComponent(recordId)}`, this.payload(input));
    return { id: recordId, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null };
  }

  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    await this.request(`/dns/delete/${encodeURIComponent(domain)}/${encodeURIComponent(recordId)}`);
  }
}
