export const DOMAIN_CSV_HEADERS = [
  "Domain",
  "Buy Now Price",
  "Floor Price",
  "Min Offer",
  "Lease to Own",
  "Max Lease Period",
  "Sale Lander",
  "Show Buy Now Option",
  "Show Lease to Own Option",
  "Show Make Offer Option",
  "Hidden",
  "TLD",
  "Date Added (UTC)",
  "Listing Status",
  "Fast Transfer",
  "Views",
  "Leads",
  "30-day Unique Searches",
  "90-day Unique Searches",
  "365-day Unique Searches",
  "30-day Total Searches",
  "90-day Total Searches",
  "365-day Total Searches",
  "GoDaddy NS",
] as const;

export type DomainCsvHeader = (typeof DOMAIN_CSV_HEADERS)[number];
export type RawDomainCsvRow = Record<DomainCsvHeader, string>;

export interface NormalizedDomain {
  fullDomain: string;
  normalizedDomain: string;
  name: string;
  tld: string;
}

export interface ParsedDomainRecord extends NormalizedDomain {
  rowNumber: number;
  isListed: boolean;
  sourceFile: string;
  buyNowPrice: string | null;
  floorPrice: string | null;
  minOffer: string | null;
  priceCurrency: string | null;
  leaseToOwn: boolean | null;
  maxLeasePeriod: number | null;
  saleLander: string | null;
  showBuyNowOption: boolean | null;
  showLeaseToOwnOption: boolean | null;
  showMakeOfferOption: boolean | null;
  hidden: boolean | null;
  listingStatus: string | null;
  fastTransfer: string | null;
  views: number | null;
  leads: number | null;
  uniqueSearches30d: number | null;
  uniqueSearches90d: number | null;
  uniqueSearches365d: number | null;
  totalSearches30d: number | null;
  totalSearches90d: number | null;
  totalSearches365d: number | null;
  godaddyNs: string | null;
  dateAddedAt: string | null;
  rawMetadataJson: string;
  initialDescription: string;
  initialKeywords: string;
  initialFeatured: boolean;
  initialRegisteredAt: string | null;
  initialExpiresAt: string | null;
  initialRegistrarName: string | null;
}

export interface DomainCsvIssue {
  rowNumber: number;
  domain: string;
  code: "empty_domain" | "invalid_domain" | "duplicate_domain" | "tld_mismatch" | "invalid_field";
  reason: string;
}

export interface DomainCsvReport {
  sourceFile: string;
  headers: string[];
  rawRecordCount: number;
  nonEmptyDomainCount: number;
  parsedCount: number;
  validCount: number;
  uniqueCount: number;
  duplicateCount: number;
  invalidCount: number;
  emptyLineCount: number;
  hiddenDistribution: Record<string, number>;
  listingStatusDistribution: Record<string, number>;
  tldDistribution: Record<string, number>;
  issues: DomainCsvIssue[];
  generatedAt: string;
}

export interface DomainCsvParseResult {
  records: ParsedDomainRecord[];
  report: DomainCsvReport;
}
