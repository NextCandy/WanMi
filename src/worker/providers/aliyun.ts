import { requiredCredential } from "./http";
import { hmacHex, sha256Hex } from "./signatures";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface AliError { Code?: string; Message?: string; }
interface AliDomain { DomainName: string; InstanceEndTime?: string; }
interface AliRecord { RecordId: string; RR: string; Type: string; Value: string; TTL?: number; Priority?: number; }

export class AliyunProvider implements RegistrarProvider {
  readonly provider = "aliyun";
  private readonly accessKeyId: string;
  private readonly accessKeySecret: string;
  private readonly host = "alidns.cn-hangzhou.aliyuncs.com";
  private readonly version = "2015-01-09";

  constructor(credentials: Record<string, string>) {
    this.accessKeyId = requiredCredential(credentials, "accessKeyId", "阿里云");
    this.accessKeySecret = requiredCredential(credentials, "accessKeySecret", "阿里云");
  }

  private async request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify(payload);
    const contentType = "application/json; charset=utf-8";
    const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const nonce = crypto.randomUUID();
    const payloadHash = await sha256Hex(body);
    const canonicalHeaders = `content-type:${contentType}\nhost:${this.host}\nx-acs-action:${action}\nx-acs-content-sha256:${payloadHash}\nx-acs-date:${date}\nx-acs-signature-nonce:${nonce}\nx-acs-version:${this.version}\n`;
    const signedHeaders = "content-type;host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version";
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const stringToSign = `ACS3-HMAC-SHA256\n${await sha256Hex(canonicalRequest)}`;
    const signature = await hmacHex(this.accessKeySecret, stringToSign);
    const authorization = `ACS3-HMAC-SHA256 Credential=${this.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;
    const response = await fetch(`https://${this.host}/`, { method: "POST", headers: { Authorization: authorization, "Content-Type": contentType, Host: this.host, "x-acs-action": action, "x-acs-content-sha256": payloadHash, "x-acs-date": date, "x-acs-signature-nonce": nonce, "x-acs-version": this.version }, body, signal: AbortSignal.timeout(15_000) });
    const parsed = (await response.json().catch(() => null)) as (T & AliError) | null;
    if (!parsed || !response.ok || parsed.Code) throw new ProviderError(`阿里云 API 失败：${parsed?.Message ?? `HTTP ${response.status}`}`);
    return parsed;
  }

  async testConnection() { await this.request("DescribeDomains", { PageNumber: 1, PageSize: 1 }); return { ok: true as const, message: "阿里云 API 凭据有效" }; }
  async listDomains(): Promise<RegistrarDomain[]> { const all: AliDomain[] = []; for (let page = 1; ; page += 1) { const result = await this.request<{ Domains?: { Domain?: AliDomain[] }; TotalCount?: number }>("DescribeDomains", { PageNumber: page, PageSize: 100 }); const items = result.Domains?.Domain ?? []; all.push(...items); if (all.length >= (result.TotalCount ?? items.length) || items.length < 100) break; } return all.map((item) => ({ domain: item.DomainName, status: null, expiresAt: item.InstanceEndTime ? new Date(item.InstanceEndTime).toISOString() : null })); }
  async listDnsRecords(domain: string): Promise<DnsRecord[]> { const all: AliRecord[] = []; for (let page = 1; ; page += 1) { const result = await this.request<{ DomainRecords?: { Record?: AliRecord[] }; TotalCount?: number }>("DescribeDomainRecords", { DomainName: domain, PageNumber: page, PageSize: 500 }); const items = result.DomainRecords?.Record ?? []; all.push(...items); if (all.length >= (result.TotalCount ?? items.length) || items.length < 500) break; } return all.filter((record) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].includes(record.Type)).map((record) => ({ id: record.RecordId, type: assertRecordType(record.Type), name: record.RR, content: record.Value, ttl: record.TTL ?? null, priority: record.Priority ?? null, proxied: null })); }
  private payload(domain: string, input: DnsRecordInput) { return { DomainName: domain, RR: input.name || "@", Type: input.type, Value: input.content, TTL: input.ttl ?? 600, ...(input.priority === null || input.priority === undefined ? {} : { Priority: input.priority }) }; }
  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> { const result = await this.request<{ RecordId: string }>("AddDomainRecord", this.payload(domain, input)); return { id: result.RecordId, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null }; }
  async updateDnsRecord(_domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> { await this.request("UpdateDomainRecord", { RecordId: recordId, RR: input.name || "@", Type: input.type, Value: input.content, TTL: input.ttl ?? 600, ...(input.priority === null || input.priority === undefined ? {} : { Priority: input.priority }) }); return { id: recordId, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null }; }
  async deleteDnsRecord(_domain: string, recordId: string): Promise<void> { await this.request("DeleteDomainRecord", { RecordId: recordId }); }
}
