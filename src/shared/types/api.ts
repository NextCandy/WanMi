export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ApiErrorBody };

export interface PublicDomain {
  id: number;
  domain: string;
  name: string;
  tld: string;
  description: string;
  category: string | null;
  categories: string[];
  is_featured: boolean;
  registered_at: string | null;
  expires_at: string | null;
  public_price?: string | null;
}

export interface PublicHomeData {
  tlds: string[];
  categories: string[];
  categoryCounts: Record<string, number>;
  total_domains: number;
  total_tlds: number;
  total_featured: number;
  featured_domains: PublicDomain[];
  latestAddedAt: string | null;
  total: number;
  tldCount: number;
  featuredCount: number;
}

export interface FeaturedDomainRecord extends PublicDomain {
  registrar_name: string | null;
  updated_at: string;
  character_count: number;
  type: string;
}

export interface FeaturedDomainRecommendation {
  id: number;
  domain: string;
  name: string;
  tld: string;
  is_featured: boolean;
}

export interface FeaturedDomainDetail {
  domain: FeaturedDomainRecord;
  same_tld: FeaturedDomainRecommendation[];
  same_length: FeaturedDomainRecommendation[];
  site: {
    name: string;
    description: string;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
