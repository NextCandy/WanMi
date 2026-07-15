import type { Paginated, PublicDomain } from "../../shared/types/api";
import { api } from "./api";

const MAX_CACHE_ENTRIES = 20;
const cache = new Map<string, Promise<Paginated<PublicDomain>>>();

export function loadCatalogue(url: string): Promise<Paginated<PublicDomain>> {
  const cached = cache.get(url);
  if (cached) return cached;
  const request = api<Paginated<PublicDomain>>(url).catch((error: unknown) => {
    cache.delete(url);
    throw error;
  });
  cache.set(url, request);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return request;
}

export function prefetchCatalogue(url: string): void {
  void loadCatalogue(url).catch(() => undefined);
}

export function clearCatalogueCache(): void {
  cache.clear();
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function canPrefetchNextPage(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return true;
  return !connection.saveData && connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}
