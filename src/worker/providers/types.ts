export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export interface RegistrarDomain {
  domain: string;
  status: string | null;
  expiresAt: string | null;
}

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  content: string;
  ttl: number | null;
  priority: number | null;
  proxied: boolean | null;
}

export interface DnsRecordInput {
  type: DnsRecordType;
  name: string;
  content: string;
  ttl?: number | null;
  priority?: number | null;
  proxied?: boolean | null;
}

export interface TestResult {
  ok: true;
  message: string;
}

export interface RegistrarProvider {
  readonly provider: string;
  testConnection(): Promise<TestResult>;
  listDomains(): Promise<RegistrarDomain[]>;
  listDnsRecords(domain: string): Promise<DnsRecord[]>;
  createDnsRecord(domain: string, input: DnsRecordInput): Promise<DnsRecord>;
  updateDnsRecord(domain: string, recordId: string, input: DnsRecordInput): Promise<DnsRecord>;
  deleteDnsRecord(domain: string, recordId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code = "PROVIDER_ERROR",
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function assertRecordType(type: string): DnsRecordType {
  const upper = type.toUpperCase();
  if (!(DNS_RECORD_TYPES as readonly string[]).includes(upper)) {
    throw new ProviderError(`不支持 DNS 记录类型 ${upper}`, "DNS_TYPE_UNSUPPORTED", 422);
  }
  return upper as DnsRecordType;
}
