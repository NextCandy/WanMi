import { useCallback, useState } from "react";

const STORAGE_KEY = "wanmi-search-history";
const STORAGE_VERSION = 1;
const MAX_HISTORY = 10;

interface StoredHistory {
  version: typeof STORAGE_VERSION;
  items: string[];
}

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredHistory> | string[];
    const items = Array.isArray(parsed) ? parsed : parsed.version === STORAGE_VERSION ? parsed.items : [];
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => {
        const key = item.toLocaleLowerCase();
        if (!item || item.length > 253 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredHistory = { version: STORAGE_VERSION, items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式、存储被禁用或额度不足时不影响搜索。
  }
}

export function useSearchHistory() {
  const [items, setItems] = useState<string[]>(readHistory);

  const add = useCallback((value: string) => {
    const query = value.trim();
    if (!query) return;
    setItems((current) => {
      const normalized = query.toLocaleLowerCase();
      const next = [query, ...current.filter((item) => item.toLocaleLowerCase() !== normalized)].slice(0, MAX_HISTORY);
      writeHistory(next);
      return next;
    });
  }, []);

  const remove = useCallback((value: string) => {
    setItems((current) => {
      const next = current.filter((item) => item !== value);
      writeHistory(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    writeHistory([]);
  }, []);

  return { items, add, remove, clear };
}
