import { describe, expect, it } from "vitest";

import { coerceFavoritesSnapshot, DEFAULT_FOLDER_ID } from "../../src/client/hooks/useDomainFavorites";
import type { PublicDomain } from "../../src/shared/types/api";

function domain(id: number, value: string): PublicDomain {
  const [name, ...tldParts] = value.split(".");
  return {
    id,
    domain: value,
    name,
    tld: tldParts.join("."),
    description: "",
    category: null,
    categories: [],
    is_featured: false,
    registered_at: null,
    expires_at: null,
  };
}

describe("收藏数据迁移 coerceFavoritesSnapshot", () => {
  it("把旧版 v1 {version,items:PublicDomain[]} 迁移为默认收藏夹条目，零丢失", () => {
    const v1 = { version: 1, items: [domain(1, "a.com"), domain(2, "b.org")] };
    const { entries, folders } = coerceFavoritesSnapshot(v1);
    expect(folders).toEqual([]);
    expect(entries.map((entry) => entry.domain.domain)).toEqual(["a.com", "b.org"]);
    expect(entries.every((entry) => entry.folderId === DEFAULT_FOLDER_ID)).toBe(true);
    expect(entries.every((entry) => entry.tags.length === 0 && entry.note === "")).toBe(true);
  });

  it("把更老的裸数组 PublicDomain[] 迁移为条目", () => {
    const { entries } = coerceFavoritesSnapshot([domain(1, "a.com")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].domain.domain).toBe("a.com");
  });

  it("保留 v2 的收藏夹、标签、备注与归属", () => {
    const v2 = {
      version: 2,
      folders: [{ id: "f1", name: "品牌", createdAt: 1 }],
      items: [{ domain: domain(9, "brand.com"), folderId: "f1", tags: ["短", "品牌"], note: "备用", createdAt: 1, updatedAt: 2 }],
    };
    const { folders, entries } = coerceFavoritesSnapshot(v2);
    expect(folders).toEqual([{ id: "f1", name: "品牌", createdAt: 1 }]);
    expect(entries[0]).toMatchObject({ folderId: "f1", tags: ["短", "品牌"], note: "备用" });
  });

  it("folderId 指向不存在的收藏夹时回落默认收藏", () => {
    const v2 = { version: 2, folders: [], items: [{ domain: domain(1, "a.com"), folderId: "ghost", tags: [], note: "", createdAt: 1, updatedAt: 1 }] };
    expect(coerceFavoritesSnapshot(v2).entries[0].folderId).toBe(DEFAULT_FOLDER_ID);
  });

  it("跳过损坏条目、去重 id，且永不抛错", () => {
    const messy = {
      version: 2,
      items: [
        domain(1, "a.com"),
        null,
        { domain: { id: "x" } },
        { nonsense: true },
        domain(1, "dup.com"), // 与 id=1 重复，保留先出现的
        domain(2, "b.com"),
      ],
    };
    const { entries } = coerceFavoritesSnapshot(messy);
    expect(entries.map((entry) => entry.domain.id)).toEqual([1, 2]);
    expect(entries[0].domain.domain).toBe("a.com");
  });

  it("对彻底非法的输入返回空快照而非崩溃", () => {
    expect(coerceFavoritesSnapshot(null)).toEqual({ folders: [], entries: [] });
    expect(coerceFavoritesSnapshot("garbage")).toEqual({ folders: [], entries: [] });
    expect(coerceFavoritesSnapshot(42)).toEqual({ folders: [], entries: [] });
  });
});
