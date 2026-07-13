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
  public_price?: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
