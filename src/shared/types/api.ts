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
  category: string | null;
  is_featured: boolean;
  is_market_listed: boolean;
  views: number | null;
  date_added_at: string | null;
  public_price?: string | null;
  floor_price?: string | null;
  min_offer?: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
