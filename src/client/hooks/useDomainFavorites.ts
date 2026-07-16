import { useCallback, useMemo, useState } from "react";

import type { PublicDomain } from "../../shared/types/api";

const STORAGE_KEY = "wanmi-domain-favorites";
const STORAGE_VERSION = 2;
const MAX_FAVORITES = 200;

type StoredPublicDomain = Omit<PublicDomain, "keywords"> & { keywords?: string[] };

interface StoredFavorites {
  version: typeof STORAGE_VERSION;
  items: StoredPublicDomain[];
}

function normalizeFavorite(domain: StoredPublicDomain | PublicDomain): PublicDomain {
  return {
    id: domain.id,
    domain: domain.domain,
    name: domain.name,
    tld: domain.tld,
    description: domain.description,
    keywords: Array.isArray(domain.keywords) ? [...domain.keywords] : [],
    category: domain.category,
    categories: [...domain.categories],
    is_featured: domain.is_featured,
    registered_at: domain.registered_at,
    expires_at: domain.expires_at,
  };
}

function isPublicDomain(value: unknown): value is StoredPublicDomain {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicDomain>;
  return Number.isInteger(item.id)
    && typeof item.domain === "string"
    && typeof item.name === "string"
    && typeof item.tld === "string"
    && typeof item.description === "string"
    && (item.keywords === undefined || (Array.isArray(item.keywords) && item.keywords.every((keyword) => typeof keyword === "string")))
    && (item.category === null || typeof item.category === "string")
    && Array.isArray(item.categories)
    && item.categories.every((category) => typeof category === "string")
    && typeof item.is_featured === "boolean"
    && (item.registered_at === null || typeof item.registered_at === "string")
    && (item.expires_at === null || typeof item.expires_at === "string");
}

function readFavorites(): PublicDomain[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredFavorites>;
    if (![1, STORAGE_VERSION].includes(Number(parsed.version)) || !Array.isArray(parsed.items)) return [];
    const seen = new Set<number>();
    return parsed.items.filter(isPublicDomain).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, MAX_FAVORITES).map(normalizeFavorite);
  } catch {
    return [];
  }
}

function writeFavorites(items: PublicDomain[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredFavorites = { version: STORAGE_VERSION, items: items.map(normalizeFavorite) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式、存储被禁用或额度不足时保留当前内存状态。
  }
}

export function useDomainFavorites() {
  const [items, setItems] = useState<PublicDomain[]>(readFavorites);
  const ids = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  const toggle = useCallback((domain: PublicDomain) => {
    setItems((current) => {
      const next = current.some((item) => item.id === domain.id)
        ? current.filter((item) => item.id !== domain.id)
        : [normalizeFavorite(domain), ...current].slice(0, MAX_FAVORITES);
      writeFavorites(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      writeFavorites(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    writeFavorites([]);
  }, []);

  const sync = useCallback((domains: PublicDomain[]) => {
    if (!domains.length) return;
    const currentById = new Map(domains.map((domain) => [domain.id, normalizeFavorite(domain)]));
    setItems((current) => {
      let changed = false;
      const next = current.map((item) => {
        const fresh = currentById.get(item.id);
        if (!fresh || JSON.stringify(fresh) === JSON.stringify(item)) return item;
        changed = true;
        return fresh;
      });
      if (!changed) return current;
      writeFavorites(next);
      return next;
    });
  }, []);

  return { items, ids, toggle, remove, clear, sync };
}
