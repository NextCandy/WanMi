import { useCallback, useMemo, useState } from "react";

import type { PublicDomain } from "../../shared/types/api";

const STORAGE_KEY = "wanmi-domain-favorites";
const STORAGE_VERSION = 2;
const MAX_FAVORITES = 500;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 24;
const MAX_NOTE_LENGTH = 500;

/** 默认收藏夹：固定 id，不可删除、不可改名 */
export const DEFAULT_FOLDER_ID = "default";

export interface FavoriteFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface FavoriteEntry {
  domain: PublicDomain;
  folderId: string;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredFavoritesV2 {
  version: 2;
  folders: FavoriteFolder[];
  items: FavoriteEntry[];
}

export interface FavoritesSnapshot {
  folders: FavoriteFolder[];
  entries: FavoriteEntry[];
}

export interface ImportPreview {
  added: number;
  duplicate: number;
  newFolders: number;
  total: number;
  snapshot: FavoritesSnapshot;
}

let counter = 0;
/** 不依赖 crypto.randomUUID（旧浏览器/非安全上下文可能缺失），本地唯一即可 */
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function normalizeDomain(domain: PublicDomain): PublicDomain {
  return {
    id: domain.id,
    domain: domain.domain,
    name: domain.name,
    tld: domain.tld,
    description: domain.description,
    category: domain.category,
    categories: [...domain.categories],
    is_featured: domain.is_featured,
    registered_at: domain.registered_at,
    expires_at: domain.expires_at,
  };
}

function isPublicDomain(value: unknown): value is PublicDomain {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicDomain>;
  return Number.isInteger(item.id)
    && typeof item.domain === "string"
    && typeof item.name === "string"
    && typeof item.tld === "string"
    && typeof item.description === "string"
    && (item.category === null || typeof item.category === "string")
    && Array.isArray(item.categories)
    && item.categories.every((category) => typeof category === "string")
    && typeof item.is_featured === "boolean"
    && (item.registered_at === null || typeof item.registered_at === "string")
    && (item.expires_at === null || typeof item.expires_at === "string");
}

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim().slice(0, MAX_TAG_LENGTH);
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

function cleanNote(note: unknown): string {
  return typeof note === "string" ? note.slice(0, MAX_NOTE_LENGTH) : "";
}

/** 把任意历史/导入数据规整为 v2 快照，逐条 try 容错，损坏项跳过而非整体失败。
 *  导出供单元测试直接校验迁移逻辑（v1 / 裸数组 / 损坏输入）。 */
export function coerceFavoritesSnapshot(raw: unknown): FavoritesSnapshot {
  const now = Date.now();
  const folders: FavoriteFolder[] = [];
  const folderIds = new Set<string>();

  const pushFolder = (folder: unknown) => {
    if (!folder || typeof folder !== "object") return;
    const candidate = folder as Partial<FavoriteFolder>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return;
    if (candidate.id === DEFAULT_FOLDER_ID || folderIds.has(candidate.id)) return;
    folderIds.add(candidate.id);
    folders.push({ id: candidate.id, name: candidate.name.trim().slice(0, 40) || "收藏夹", createdAt: Number(candidate.createdAt) || now });
  };

  if (raw && typeof raw === "object" && Array.isArray((raw as StoredFavoritesV2).folders)) {
    (raw as StoredFavoritesV2).folders.forEach(pushFolder);
  }

  // 兼容三种历史形态：v2 {items:FavoriteEntry[]} / v1 {items:PublicDomain[]} / 裸数组 PublicDomain[]
  const rawItems: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : [];

  const entries: FavoriteEntry[] = [];
  const seen = new Set<number>();
  for (const item of rawItems) {
    try {
      // v2 条目：{ domain, folderId, tags, note, ... }
      const asEntry = item as Partial<FavoriteEntry> & { domain?: unknown };
      const domainSource = asEntry && typeof asEntry === "object" && "domain" in asEntry && typeof asEntry.domain === "object"
        ? asEntry.domain
        : item; // v1/裸数组：条目本身即 PublicDomain
      if (!isPublicDomain(domainSource) || seen.has(domainSource.id)) continue;
      seen.add(domainSource.id);
      const folderId = typeof asEntry.folderId === "string" && (asEntry.folderId === DEFAULT_FOLDER_ID || folderIds.has(asEntry.folderId))
        ? asEntry.folderId
        : DEFAULT_FOLDER_ID;
      entries.push({
        domain: normalizeDomain(domainSource),
        folderId,
        tags: cleanTags(asEntry.tags),
        note: cleanNote(asEntry.note),
        createdAt: Number(asEntry.createdAt) || now,
        updatedAt: Number(asEntry.updatedAt) || now,
      });
      if (entries.length >= MAX_FAVORITES) break;
    } catch {
      // 单条损坏跳过，不影响其余收藏
    }
  }
  return { folders, entries };
}

function readSnapshot(): FavoritesSnapshot {
  if (typeof window === "undefined") return { folders: [], entries: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { folders: [], entries: [] };
    return coerceFavoritesSnapshot(JSON.parse(raw));
  } catch {
    // JSON 损坏时返回空，且不立即覆盖，等下一次显式写入再替换
    return { folders: [], entries: [] };
  }
}

function writeSnapshot(snapshot: FavoritesSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredFavoritesV2 = { version: STORAGE_VERSION, folders: snapshot.folders, items: snapshot.entries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式、存储被禁用或额度不足时保留当前内存状态
  }
}

export function useDomainFavorites() {
  const [snapshot, setSnapshot] = useState<FavoritesSnapshot>(readSnapshot);
  const { folders, entries } = snapshot;

  const commit = useCallback((updater: (current: FavoritesSnapshot) => FavoritesSnapshot) => {
    setSnapshot((current) => {
      const next = updater(current);
      writeSnapshot(next);
      return next;
    });
  }, []);

  const ids = useMemo(() => new Set(entries.map((entry) => entry.domain.id)), [entries]);
  const items = useMemo(() => entries.map((entry) => entry.domain), [entries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.domain.id, entry])), [entries]);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => entry.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [entries]);

  const toggle = useCallback((domain: PublicDomain) => {
    commit((current) => {
      const exists = current.entries.some((entry) => entry.domain.id === domain.id);
      if (exists) {
        return { ...current, entries: current.entries.filter((entry) => entry.domain.id !== domain.id) };
      }
      const now = Date.now();
      const entry: FavoriteEntry = { domain: normalizeDomain(domain), folderId: DEFAULT_FOLDER_ID, tags: [], note: "", createdAt: now, updatedAt: now };
      return { ...current, entries: [entry, ...current.entries].slice(0, MAX_FAVORITES) };
    });
  }, [commit]);

  const remove = useCallback((id: number) => {
    commit((current) => ({ ...current, entries: current.entries.filter((entry) => entry.domain.id !== id) }));
  }, [commit]);

  const clear = useCallback(() => {
    commit((current) => ({ ...current, entries: [] }));
  }, [commit]);

  /** 目录数据刷新后，同步已收藏条目的域名快照（精品状态、简介等可能变化）。
   *  只在确有变化时写入，避免每次筛选都触发 localStorage 写。 */
  const sync = useCallback((domains: PublicDomain[]) => {
    if (!domains.length) return;
    const fresh = new Map(domains.map((domain) => [domain.id, normalizeDomain(domain)]));
    setSnapshot((current) => {
      let changed = false;
      const nextEntries = current.entries.map((entry) => {
        const next = fresh.get(entry.domain.id);
        if (!next || JSON.stringify(next) === JSON.stringify(entry.domain)) return entry;
        changed = true;
        return { ...entry, domain: next };
      });
      if (!changed) return current;
      const nextSnapshot = { ...current, entries: nextEntries };
      writeSnapshot(nextSnapshot);
      return nextSnapshot;
    });
  }, []);

  const setNote = useCallback((id: number, note: string) => {
    commit((current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.domain.id === id ? { ...entry, note: note.slice(0, MAX_NOTE_LENGTH), updatedAt: Date.now() } : entry),
    }));
  }, [commit]);

  const setTags = useCallback((id: number, tags: string[]) => {
    const cleaned = cleanTags(tags);
    commit((current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.domain.id === id ? { ...entry, tags: cleaned, updatedAt: Date.now() } : entry),
    }));
  }, [commit]);

  const moveToFolder = useCallback((id: number, folderId: string) => {
    commit((current) => {
      const valid = folderId === DEFAULT_FOLDER_ID || current.folders.some((folder) => folder.id === folderId);
      const target = valid ? folderId : DEFAULT_FOLDER_ID;
      return { ...current, entries: current.entries.map((entry) => entry.domain.id === id ? { ...entry, folderId: target, updatedAt: Date.now() } : entry) };
    });
  }, [commit]);

  const addFolder = useCallback((name: string): string => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return DEFAULT_FOLDER_ID;
    const id = localId("folder");
    commit((current) => {
      if (current.folders.some((folder) => folder.name === trimmed)) return current;
      return { ...current, folders: [...current.folders, { id, name: trimmed, createdAt: Date.now() }] };
    });
    return id;
  }, [commit]);

  const renameFolder = useCallback((id: string, name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed || id === DEFAULT_FOLDER_ID) return;
    commit((current) => ({ ...current, folders: current.folders.map((folder) => folder.id === id ? { ...folder, name: trimmed } : folder) }));
  }, [commit]);

  /** 删除收藏夹：夹内域名回落到默认收藏，绝不连带删除域名 */
  const removeFolder = useCallback((id: string) => {
    if (id === DEFAULT_FOLDER_ID) return;
    commit((current) => ({
      folders: current.folders.filter((folder) => folder.id !== id),
      entries: current.entries.map((entry) => entry.folderId === id ? { ...entry, folderId: DEFAULT_FOLDER_ID, updatedAt: Date.now() } : entry),
    }));
  }, [commit]);

  const exportSnapshot = useCallback((): StoredFavoritesV2 & { exportedAt: string } => ({
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    folders,
    items: entries,
  }), [folders, entries]);

  /** 预演导入：统计新增/重复/新增收藏夹，交由 UI 展示后再确认，避免静默覆盖 */
  const previewImport = useCallback((raw: unknown): ImportPreview => {
    const incoming = coerceFavoritesSnapshot(raw);
    let added = 0;
    let duplicate = 0;
    incoming.entries.forEach((entry) => (ids.has(entry.domain.id) ? duplicate++ : added++));
    const existingFolderNames = new Set(folders.map((folder) => folder.name));
    const newFolders = incoming.entries.length
      ? incoming.folders.filter((folder) => !existingFolderNames.has(folder.name)).length
      : 0;
    return { added, duplicate, newFolders, total: incoming.entries.length, snapshot: incoming };
  }, [ids, folders]);

  /** 应用导入：merge 保留已有备注/标签，overwrite 用导入数据覆盖同名条目 */
  const applyImport = useCallback((incoming: FavoritesSnapshot, mode: "merge" | "overwrite") => {
    commit((current) => {
      // 合并收藏夹：按名称去重，导入的新夹追加
      const folderByName = new Map(current.folders.map((folder) => [folder.name, folder]));
      const remap = new Map<string, string>();
      const mergedFolders = [...current.folders];
      incoming.folders.forEach((folder) => {
        const existing = folderByName.get(folder.name);
        if (existing) {
          remap.set(folder.id, existing.id);
        } else {
          const id = localId("folder");
          remap.set(folder.id, id);
          const created = { id, name: folder.name, createdAt: folder.createdAt || Date.now() };
          mergedFolders.push(created);
          folderByName.set(folder.name, created);
        }
      });
      const byId = new Map(current.entries.map((entry) => [entry.domain.id, entry]));
      incoming.entries.forEach((entry) => {
        const folderId = entry.folderId === DEFAULT_FOLDER_ID ? DEFAULT_FOLDER_ID : (remap.get(entry.folderId) ?? DEFAULT_FOLDER_ID);
        const normalized: FavoriteEntry = { ...entry, domain: normalizeDomain(entry.domain), folderId };
        const existing = byId.get(entry.domain.id);
        if (!existing) byId.set(entry.domain.id, normalized);
        else if (mode === "overwrite") byId.set(entry.domain.id, normalized);
        // merge 模式且已存在：保留现有条目
      });
      const nextEntries = [...byId.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, MAX_FAVORITES);
      return { folders: mergedFolders, entries: nextEntries };
    });
  }, [commit]);

  return {
    items,
    entries,
    folders,
    ids,
    entryById,
    allTags,
    toggle,
    remove,
    clear,
    sync,
    setNote,
    setTags,
    moveToFolder,
    addFolder,
    renameFolder,
    removeFolder,
    exportSnapshot,
    previewImport,
    applyImport,
  };
}

export type UseDomainFavorites = ReturnType<typeof useDomainFavorites>;
