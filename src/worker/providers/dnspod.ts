import { requiredCredential } from "./http";
import { hmac, hmacHex, sha256Hex } from "./signatures";
import { assertRecordType, ProviderError, type DnsRecord, type DnsRecordInput, type RegistrarDomain, type RegistrarProvider } from "./types";

interface TencentEnvelope<T> { Response: T & { RequestId?: string; Error?: { Code?: string; Message?: string } }; }
interface TencentDomain { Name: string; Status?: string; }
interface TencentRecord { RecordId: number; Type: string; Name: string; Value: string; TTL?: number; MX?: number; }

export class DnsPodProvider implements RegistrarProvider {
  readonly provider = "dnspod";
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly host = "dnspod.tencentcloudapi.com";
  private readonly service = "dnspod";
  private readonly version = "2021-03-23";

  constructor(credentials: Record<string, string>) {
    this.secretId = requiredCredential(credentials, "secretId", "DNSPod");
    this.secretKey = requiredCredential(credentials, "secretKey", "DNSPod");
  }

  private async request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const contentType = "application/json; charset=utf-8";
    const canonicalHeaders = `content-type:${contentType}\nhost:${this.host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = "content-type;host;x-tc-action";
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256Hex(body)}`;
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
    const secretDate = await hmac(`TC3${this.secretKey}`, date);
    const secretService = await hmac(secretDate, this.service);
    const secretSigning = await hmac(secretService, "tc3_request");
    const signature = await hmacHex(secretSigning, stringToSign);
    const authorization = `TC3-HMAC-SHA256 Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${this.host}`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": contentType, Host: this.host, "X-TC-Action": action, "X-TC-Timestamp": String(timestamp), "X-TC-Version": this.version },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = (await response.json().catch(() => null)) as TencentEnvelope<T> | null;
    if (!envelope || !response.ok || envelope.Response.Error) {
      throw new ProviderError(`DNSPod API 失败：${envelope?.Response.Error?.Message ?? `HTTP ${response.status}`}`);
    }
    return envelope.Response;
  }

  async testConnection() { await this.request("DescribeDomainList", { Limit: 1, Offset: 0, Type: "ALL" }); return { ok: true as const, message: "DNSPod API 凭据有效" }; }

  async listDomains(): Promise<RegistrarDomain[]> {
    const all: TencentDomain[] = [];
    for (let offset = 0; ; offset += 3000) {
      const result = await this.request<{ DomainList?: TencentDomain[] }>("DescribeDomainList", { Limit: 3000, Offset: offset, Type: "ALL" });
      const page = result.DomainList ?? []; all.push(...page); if (page.length < 3000) break;
    }
    return all.map((item) => ({ domain: item.Name, status: item.Status ?? null, expiresAt: null }));
  }

  async listDnsRecords(domain: string): Promise<DnsRecord[]> {
    const result = await this.request<{ RecordList?: TencentRecord[] }>("DescribeRecordList", { Domain: domain, Limit: 3000, Offset: 0, ErrorOnEmpty: "no" });
    return (result.RecordList ?? []).filter((record) => ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"].includes(record.Type)).map((record) => ({ id: String(record.RecordId), type: assertRecordType(record.Type), name: record.Name, content: record.Value, ttl: record.TTL ?? null, priority: record.MX ?? null, proxied: null }));
  }

  private payload(domain: string, input: DnsRecordInput) { return { Domain: domain, SubDomain: input.name || "@", RecordType: input.type, RecordLine: "默认", Value: input.content, TTL: input.ttl ?? 600, ...(input.priority === null || input.priority === undefined ? {} : { MX: input.priority }) }; }
  async createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord> { const result = await this.request<{ RecordId: number }>("CreateRecord", this.payload(domain, input)); return { id: String(result.RecordId), type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null }; }
  async updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord> { await this.request("ModifyRecord", { ...this.payload(domain, input), RecordId: Number(recordId) }); return { id: recordId, type: input.type, name: input.name || "@", content: input.content, ttl: input.ttl ?? 600, priority: input.priority ?? null, proxied: null }; }
  async deleteDnsRecord(domain: string, recordId: string): Promise<void> { await this.request("DeleteRecord", { Domain: domain, RecordId: Number(recordId) }); }
}
