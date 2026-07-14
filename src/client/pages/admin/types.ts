export type AdminView =
  | "overview"
  | "domains"
  | "categories"
  | "settings"
  | "notifications"
  | "security"
  | "logs";

export interface AdminUser {
  id: number;
  email: string;
  sessionId: string;
}

export type Notify = (text: string, tone?: "success" | "error") => void;

export interface DashboardData {
  counts: { total: number; listed: number; hidden: number; featured: number };
  expiring90d: Array<{ full_domain: string; expires_at: string }>;
  tlds: Array<{ tld: string; count: number }>;
  recentLogs: Array<{ id: number; level: string; action: string; message: string; success: number; created_at: string }>;
  hasExpirationData: boolean;
}

export interface AdminDomain {
  id: number;
  full_domain: string;
  name: string;
  tld: string;
  category: string | null;
  is_featured: number;
  is_listed: number;
  notes: string | null;
  description: string;
  auto_category: string;
  auto_subcategory: string;
  auto_category_confidence: number;
  effective_category: string;
  category_source: "auto" | "manual";
}

export interface AdminDomainPage {
  items: AdminDomain[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CategoryRow {
  id: number;
  name: string;
  domain_count: number;
  is_auto?: number;
}
