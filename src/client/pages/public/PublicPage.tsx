import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AdvancedSearchPanel,
  EMPTY_ADVANCED_FILTERS,
  type AdvancedFilterValue,
  type DomainKind,
} from "../../components/AdvancedSearchPanel";
import { CatalogueHero } from "../../components/CatalogueHero";
import { CatalogueSearch } from "../../components/CatalogueSearch";
import { ContactIcons } from "../../components/ContactIcons";
import { DomainCard } from "../../components/DomainCard";
import { DomainDetailDialog } from "../../components/DomainDetailDialog";
import { FavoritesToolbar, ALL_FOLDERS } from "../../components/FavoritesToolbar";
import { PublicBottomNav } from "../../components/PublicBottomNav";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { useDomainFavorites, type ImportPreview } from "../../hooks/useDomainFavorites";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useTracker } from "../../hooks/useTracker";
import { api } from "../../lib/api";
import { clearCatalogueCache, loadCatalogue } from "../../lib/catalogue-cache";
import { copyText } from "../../lib/clipboard";
import { downloadTextFile, favoritesToCsv, readImportFile } from "../../lib/favorites-io";
import type { Paginated, PublicDomain } from "../../../shared/types/api";

interface SiteSettings {
  site_name: string;
  site_description: string;
  site_bio: string | null;
  logo_url: string | null;
  accent_color: string;
  display_density: string;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  wechat_qr_url: string | null;
  show_admin_link_in_footer: boolean;
  contact_whatsapp: string | null;
  contact_x: string | null;
  contact_xiaohongshu: string | null;
  contact_qq: string | null;
}

interface DomainFacets {
  tlds: string[];
  categories: string[];
  categoryCounts: Record<string, number>;
  total: number;
  tldCount: number;
  featuredCount: number;
  latestAddedAt: string | null;
}

type SortKey = "default" | "added_desc" | "length_asc" | "domain_asc";
type GroupKey = "all" | "featured" | "two" | "three";

const SORTS: Array<[SortKey, string]> = [
  ["default", "默认"],
  ["added_desc", "最新添加"],
  ["length_asc", "位数"],
  ["domain_asc", "字母序"],
];

const CATEGORY_ICONS: Record<string, string> = {
  "纯数字": "#", "三数字": "3", "四数字": "4", "五数字": "5", "六数字": "6", "七数字": "7", "八数字": "8", "九数字": "9",
  "纯字母": "A", "三字母": "3A", "四字母": "4A", "拼音": "拼", "单拼": "单", "双拼": "双",
  "三拼": "三", "四拼": "四", "英文词语": "En", "杂米": "◇", "二杂": "2◇", "三杂": "3◇",
};

interface Filters {
  q: string;
  tld: string;
  category: string;
  group: GroupKey;
  sort: SortKey;
  page: number;
  advanced: AdvancedFilterValue;
}

function initialFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") as SortKey | null;
  const group = params.get("group") as GroupKey | null;
  const kind = params.get("kind") as DomainKind | null;
  return {
    q: params.get("q") ?? "",
    tld: params.get("tld") ?? "",
    category: params.get("category") ?? "",
    group: group && ["all", "featured", "two", "three"].includes(group) ? group : "all",
    sort: sort && SORTS.some(([key]) => key === sort) ? sort : "default",
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
    advanced: {
      minLength: params.get("minLength") ?? "",
      maxLength: params.get("maxLength") ?? "",
      contains: params.get("contains") ?? "",
      excludes: params.get("excludes") ?? "",
      kind: kind && ["digits", "letters", "alphanumeric", "hyphen"].includes(kind) ? kind : "",
    },
  };
}

function groupParams(group: GroupKey): Record<string, string> {
  if (group === "featured") return { featured: "true" };
  if (group === "two") return { length: "2" };
  if (group === "three") return { length: "3" };
  return {};
}

function advancedParams(advanced: AdvancedFilterValue): Record<string, string> {
  return {
    ...(advanced.minLength ? { minLength: advanced.minLength } : {}),
    ...(advanced.maxLength ? { maxLength: advanced.maxLength } : {}),
    ...(advanced.contains ? { contains: advanced.contains } : {}),
    ...(advanced.excludes ? { excludes: advanced.excludes } : {}),
    ...(advanced.kind ? { kind: advanced.kind } : {}),
  };
}

function hasAdvancedFilters(advanced: AdvancedFilterValue): boolean {
  return Boolean(advanced.minLength || advanced.maxLength || advanced.contains || advanced.excludes || advanced.kind);
}

function catalogueUrl(filters: Filters, page = filters.page): string {
  const params = new URLSearchParams({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.tld ? { tld: filters.tld } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...groupParams(filters.group),
    ...advancedParams(filters.advanced),
    ...(filters.sort !== "default" ? { sort: filters.sort } : {}),
    page: String(page),
    pageSize: "36",
  });
  return `/api/public/domains?${params}`;
}

function pageItems(current: number, total: number): Array<number | string> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right);
  const result: Array<number | string> = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) result.push(`ellipsis-${previous}`);
    result.push(page);
  });
  return result;
}

export function PublicPage() {
  useTracker("/");
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [facets, setFacets] = useState<DomainFacets | null>(null);
  const [pageData, setPageData] = useState<Paginated<PublicDomain> | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [draftSearch, setDraftSearch] = useState(filters.q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favFolder, setFavFolder] = useState<string>(ALL_FOLDERS);
  const [favTag, setFavTag] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const [selectedDomain, setSelectedDomain] = useState<PublicDomain | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dataVersion = useRef("");
  const requestSequence = useRef(0);
  const favorites = useDomainFavorites();
  const history = useSearchHistory();

  const notify = useCallback((text: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      api<SiteSettings>("/api/public/settings"),
      api<DomainFacets>("/api/public/facets"),
    ]).then(([settingsResult, facetsResult]) => {
      if (!active) return;
      if (settingsResult.status === "fulfilled") {
        setSettings(settingsResult.value);
        document.documentElement.style.setProperty("--brand", settingsResult.value.accent_color);
        document.title = `${settingsResult.value.site_name} · 域名展示`;
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        description?.setAttribute("content", settingsResult.value.site_description);
      } else {
        setError(settingsResult.reason instanceof Error ? settingsResult.reason.message : "站点设置加载失败");
      }
      setFacets(facetsResult.status === "fulfilled" ? facetsResult.value : null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.tld) params.set("tld", filters.tld);
    if (filters.category) params.set("category", filters.category);
    if (filters.group !== "all") params.set("group", filters.group);
    if (filters.sort !== "default") params.set("sort", filters.sort);
    if (filters.page > 1) params.set("page", String(filters.page));
    Object.entries(advancedParams(filters.advanced)).forEach(([key, value]) => params.set(key, value));
    window.history.replaceState(null, "", params.size ? `/?${params}` : "/");

    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    const url = catalogueUrl(filters);
    void loadCatalogue(url)
      .then((result) => {
        if (sequence !== requestSequence.current) return;
        setPageData(result);
        favorites.sync(result.items);
      })
      .catch((reason: unknown) => {
        if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "域名加载失败");
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [filters, favorites.sync]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const result = await api<{ version: string }>("/api/public/version");
        if (!active) return;
        if (dataVersion.current && result.version !== dataVersion.current) {
          clearCatalogueCache();
          setFilters((current) => ({ ...current }));
        }
        dataVersion.current = result.version;
      } catch {
        // 下一轮继续检查。
      }
    };
    void check();
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(checkWhenVisible, 60_000);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!contactOpen && !categoryOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContactOpen(false);
        setCategoryOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [categoryOpen, contactOpen]);

  const hasContact = Boolean(settings?.contact_email || settings?.contact_wechat || settings?.contact_telegram || settings?.contact_whatsapp || settings?.contact_x || settings?.contact_xiaohongshu || settings?.contact_qq);
  const hasActiveFilter = Boolean(filters.q || filters.tld || filters.category || filters.group !== "all" || filters.sort !== "default" || hasAdvancedFilters(filters.advanced));
  const activeFilterCount =
    (filters.q ? 1 : 0) + (filters.tld ? 1 : 0) + (filters.category ? 1 : 0) +
    (filters.group !== "all" ? 1 : 0) + (filters.sort !== "default" ? 1 : 0) +
    [filters.advanced.minLength, filters.advanced.maxLength, filters.advanced.contains, filters.advanced.excludes, filters.advanced.kind].filter(Boolean).length;
  const categories = useMemo(() => [
    { value: "", label: "全部", count: facets?.total ?? 0, icon: "▦" },
    { value: "__featured", label: "精品", count: facets?.featuredCount ?? 0, icon: "☆" },
    ...(facets?.categories ?? []).map((category) => ({ value: category, label: category, count: facets?.categoryCounts[category] ?? 0, icon: CATEGORY_ICONS[category] ?? category.slice(0, 1) })),
  ], [facets]);
  const catalogueItems = pageData?.items ?? [];
  const favoriteView = favorites.entries.filter((entry) =>
    (favFolder === ALL_FOLDERS || entry.folderId === favFolder) && (!favTag || entry.tags.includes(favTag)),
  );
  const displayedItems = favoritesOnly ? favoriteView.map((entry) => entry.domain) : catalogueItems;

  function applySearch(value: string) {
    const query = value.trim();
    setDraftSearch(query);
    if (query) history.add(query);
    setFavoritesOnly(false);
    setFilters((current) => ({ ...current, q: query, page: 1 }));
  }

  function resetFilters() {
    setDraftSearch("");
    setFavoritesOnly(false);
    setFilters({ q: "", tld: "", category: "", group: "all", sort: "default", page: 1, advanced: EMPTY_ADVANCED_FILTERS });
  }

  function selectCategory(value: string) {
    setFavoritesOnly(false);
    setFilters((current) => value === "__featured"
      ? { ...current, category: "", group: "featured", page: 1 }
      : { ...current, category: value, group: "all", page: 1 });
  }

  const copyDomain = useCallback(async (domain: string) => {
    if (await copyText(domain)) notify(`已复制 ${domain}`);
    else notify("复制失败，请手动复制", "error");
  }, [notify]);

  const toggleFavorite = useCallback((domain: PublicDomain) => {
    const willFavorite = !favorites.ids.has(domain.id);
    favorites.toggle(domain);
    notify(willFavorite ? `已收藏 ${domain.domain}` : `已取消收藏 ${domain.domain}`);
  }, [favorites.ids, favorites.toggle, notify]);

  function discoverRandom() {
    const pool = displayedItems.length ? displayedItems : catalogueItems;
    if (!pool.length) {
      notify("当前没有可随机发现的公开域名", "error");
      return;
    }
    const candidates = selectedDomain && pool.length > 1 ? pool.filter((item) => item.id !== selectedDomain.id) : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setSelectedDomain(chosen);
    setHighlightedId(chosen.id);
    window.requestAnimationFrame(() => document.getElementById(`domain-card-${chosen.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.setTimeout(() => setHighlightedId((current) => current === chosen.id ? null : current), 1800);
  }

  function showFavorites() {
    setFavoritesOnly(true);
    setAdvancedOpen(false);
    document.getElementById("domains")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportFavoritesJson() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`wanmi-收藏-${stamp}.json`, JSON.stringify(favorites.exportSnapshot(), null, 2), "application/json");
    notify(`已导出 ${favorites.entries.length} 个收藏（JSON）`);
  }

  function exportFavoritesCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`wanmi-收藏-${stamp}.csv`, favoritesToCsv(favorites.entries, favorites.folders), "text/csv");
    notify(`已导出 ${favorites.entries.length} 个收藏（CSV）`);
  }

  async function handleImportFile(file?: File) {
    if (!file) return;
    try {
      const preview = favorites.previewImport(await readImportFile(file));
      if (!preview.total) { notify("文件中没有可导入的收藏", "error"); return; }
      setImportPreview(preview);
    } catch {
      notify("导入失败：文件不是有效的收藏 JSON", "error");
    }
  }

  function confirmImport(mode: "merge" | "overwrite") {
    if (!importPreview) return;
    favorites.applyImport(importPreview.snapshot, mode);
    const overwritten = mode === "overwrite" ? importPreview.duplicate : 0;
    const skipped = mode === "merge" ? importPreview.duplicate : 0;
    notify(`导入完成：新增 ${importPreview.added}${overwritten ? `，覆盖 ${overwritten}` : ""}${skipped ? `，跳过 ${skipped}` : ""} 个`);
    setImportPreview(null);
  }

  return (
    <div className={`public-shell density-${settings?.display_density ?? "comfortable"}`}>
      <header className="public-header">
        <a className="brand" href="/" aria-label="玩米首页">
          {settings?.logo_url ? <img src={settings.logo_url} alt="玩米 Logo" decoding="async" fetchPriority="high" /> : <span className="brand-mark">玩米</span>}
        </a>
        <nav>
          <a className={!favoritesOnly ? "active" : ""} href="#domains" onClick={() => setFavoritesOnly(false)}>域名</a>
          <button type="button" className={favoritesOnly ? "active text-button" : "text-button"} onClick={showFavorites}>收藏 <small>{favorites.items.length}</small></button>
          {hasContact && <button type="button" className="text-button" onClick={() => setContactOpen(true)}>联系</button>}
        </nav>
        <div className="header-actions"><button type="button" className="header-discover" onClick={discoverRandom}>随机发现</button><ThemeToggle /></div>
      </header>

      <main className="catalogue-layout" id="domains">
        <CatalogueHero
          title={settings?.site_name ?? "玩米"}
          description={settings?.site_description ?? "发现值得珍藏的域名"}
          bio={settings?.site_bio ?? null}
          total={facets?.total ?? 0}
          tldCount={facets?.tldCount ?? 0}
          featuredCount={facets?.featuredCount ?? 0}
          latestAddedAt={facets?.latestAddedAt ?? null}
          categoryCounts={facets?.categoryCounts ?? {}}
        />

        <aside className="category-rail" aria-label="域名分类">
          <div className="category-list">
            {categories.slice(0, 8).map((option) => {
              const active = !favoritesOnly && (option.value === "__featured" ? filters.group === "featured" : filters.group !== "featured" && filters.category === option.value);
              return <button type="button" className={active ? "category-item active" : "category-item"} aria-pressed={active} key={option.value || "all"} onClick={() => selectCategory(option.value)}>
                <span className="category-icon" aria-hidden="true">{option.icon}</span><span className="category-label">{option.label}</span><span className="category-count">{option.count}</span>
              </button>;
            })}
            {categories.length > 8 && <button type="button" className="category-item more-categories" onClick={() => setCategoryOpen(true)}><span className="category-icon" aria-hidden="true">＋</span><span className="category-label">更多</span><span className="category-count">{categories.length - 8}</span></button>}
          </div>
        </aside>

        <section className="domain-section" aria-labelledby="domain-section-title">
          <h2 id="domain-section-title" className="visually-hidden">公开域名目录</h2>
          <div className="catalogue-toolbar">
            <CatalogueSearch
              value={draftSearch}
              onChange={setDraftSearch}
              onSubmit={applySearch}
              onClear={() => { setDraftSearch(""); setFilters((current) => ({ ...current, q: "", page: 1 })); }}
              history={history.items}
              onRemoveHistory={history.remove}
              onClearHistory={history.clear}
              tlds={facets?.tlds ?? []}
              featuredCount={facets?.featuredCount ?? 0}
              onSelectDomain={(domain) => applySearch(domain.domain)}
              onSelectTld={(tld) => { setFavoritesOnly(false); setFilters((current) => ({ ...current, tld, page: 1 })); }}
              onShowFeatured={() => { setFavoritesOnly(false); setFilters((current) => ({ ...current, category: "", group: "featured", page: 1 })); }}
            />
            <div className="toolbar-filters">
              <label><span>后缀</span><select aria-label="后缀筛选" value={filters.tld} onChange={(event) => { setFavoritesOnly(false); setFilters((current) => ({ ...current, tld: event.target.value, page: 1 })); }}><option value="">全部</option>{(facets?.tlds ?? []).map((tld) => <option key={tld} value={tld}>.{tld}</option>)}</select></label>
              <label><span>位数</span><select aria-label="位数筛选" value={["two", "three"].includes(filters.group) ? filters.group : "all"} onChange={(event) => { setFavoritesOnly(false); setFilters((current) => ({ ...current, group: event.target.value as GroupKey, page: 1 })); }}><option value="all">全部</option><option value="two">2 位</option><option value="three">3 位</option></select></label>
              <button type="button" className={`advanced-toggle${hasAdvancedFilters(filters.advanced) ? " active" : ""}`} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>高级筛选{hasAdvancedFilters(filters.advanced) ? " · 已启用" : ""}</button>
            </div>
            <div className="sort-row" aria-label="排序"><span>排序</span>{SORTS.map(([key, label]) => <button type="button" key={key} className={filters.sort === key ? "active" : ""} onClick={() => { setFavoritesOnly(false); setFilters((current) => ({ ...current, sort: key, page: 1 })); }}>{label}</button>)}</div>
            <div className="toolbar-summary"><span>{favoritesOnly ? `本地收藏 ${favorites.items.length} 个` : loading ? "正在读取…" : `共 ${pageData?.total ?? 0} 个域名`}</span><div className="view-switch"><button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>卡片</button><button type="button" className={viewMode === "compact" ? "active" : ""} onClick={() => setViewMode("compact")}>紧凑</button></div>{!favoritesOnly && activeFilterCount > 0 && <span className="filter-count" aria-label={`已启用 ${activeFilterCount} 项筛选`}>已启用 {activeFilterCount} 项筛选</span>}{(hasActiveFilter || favoritesOnly) && <button type="button" className="clear-filter" onClick={resetFilters}>清除筛选</button>}</div>
            <AdvancedSearchPanel open={advancedOpen} value={filters.advanced} onClose={() => setAdvancedOpen(false)} onReset={() => setFilters((current) => ({ ...current, advanced: EMPTY_ADVANCED_FILTERS, page: 1 }))} onApply={(advanced) => { setFavoritesOnly(false); setFilters((current) => ({ ...current, advanced, page: 1 })); setAdvancedOpen(false); }} />
          </div>

          {favoritesOnly && <FavoritesToolbar folders={favorites.folders} entries={favorites.entries} allTags={favorites.allTags} selectedFolder={favFolder} selectedTag={favTag} onSelectFolder={setFavFolder} onSelectTag={setFavTag} onAddFolder={favorites.addFolder} onRenameFolder={favorites.renameFolder} onRemoveFolder={favorites.removeFolder} onExportJson={exportFavoritesJson} onExportCsv={exportFavoritesCsv} onImport={() => fileInputRef.current?.click()} onClear={() => { favorites.clear(); notify("已清空本地收藏"); }} />}
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void handleImportFile(file); }} />

          {!favoritesOnly && error && <div className="state-panel error-panel"><strong>加载失败</strong><span>{error}</span><button type="button" onClick={() => { clearCatalogueCache(); setFilters((current) => ({ ...current })); }}>重试</button></div>}
          {!favoritesOnly && loading && <div className="domain-list skeleton-list">{Array.from({ length: 8 }, (_, index) => <div className="domain-card skeleton" key={index} />)}</div>}
          {!loading && !error && !favoritesOnly && pageData?.items.length === 0 && <div className="state-panel"><strong>没有匹配的域名</strong><span>换一个关键词，或清除筛选后再试。</span><button type="button" onClick={resetFilters}>清除筛选</button></div>}
          {favoritesOnly && favorites.entries.length === 0 && <div className="state-panel favorites-empty"><strong>还没有收藏</strong><span>点击域名卡片上的“收藏”，它会只保存在当前浏览器。</span><button type="button" onClick={() => setFavoritesOnly(false)}>浏览全部域名</button></div>}
          {favoritesOnly && favorites.entries.length > 0 && favoriteView.length === 0 && <div className="state-panel"><strong>该筛选下暂无收藏</strong><span>换一个收藏夹或标签，或查看全部收藏。</span><button type="button" onClick={() => { setFavFolder(ALL_FOLDERS); setFavTag(""); }}>查看全部收藏</button></div>}
          {displayedItems.length > 0 && (!loading || favoritesOnly) && <div className={`domain-list ${viewMode === "compact" ? "compact-view" : "card-view"}`}>
            {displayedItems.map((domain) => <DomainCard
              key={domain.id}
              domain={domain}
              favorite={favorites.ids.has(domain.id)}
              highlighted={highlightedId === domain.id}
              query={favoritesOnly ? "" : filters.q}
              onCopy={copyDomain}
              onFavorite={toggleFavorite}
              onQuickView={setSelectedDomain}
            />)}
          </div>}

          {!favoritesOnly && pageData && pageData.totalPages > 1 && <nav className="pagination" aria-label="域名分页"><button type="button" disabled={pageData.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>上一页</button><div>{pageItems(pageData.page, pageData.totalPages).map((item) => typeof item === "number" ? <button type="button" key={item} className={pageData.page === item ? "active" : ""} aria-current={pageData.page === item ? "page" : undefined} onClick={() => setFilters((current) => ({ ...current, page: item }))}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div><button type="button" disabled={pageData.page >= pageData.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button></nav>}
        </section>
      </main>

      {categoryOpen && <div className="category-drawer-backdrop" onClick={() => setCategoryOpen(false)}><section className="category-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="更多分类"><header><h2>全部分类</h2><button type="button" onClick={() => setCategoryOpen(false)} aria-label="关闭分类">×</button></header><div>{categories.map((option) => <button type="button" key={option.value || "all"} onClick={() => { selectCategory(option.value); setCategoryOpen(false); }}><span>{option.icon}</span>{option.label}<small>{option.count}</small></button>)}</div></section></div>}

      <footer className="public-footer footer-grid"><div className="footer-brand"><strong>{settings?.site_name ?? "玩米"}</strong><span>{settings?.copyright_text || `© ${new Date().getFullYear()} 保留所有权利`}</span>{settings?.icp_number && <span>{settings.icp_number}</span>}</div>{settings && <ContactIcons settings={settings} notify={notify} />}<div className="footer-right">{settings?.show_admin_link_in_footer && <a className="footer-admin-link" href="/admin">管理</a>}</div></footer>

      {contactOpen && settings && <div className="modal-backdrop" onMouseDown={() => setContactOpen(false)}><div className="contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="contact-title"><button type="button" className="modal-close" aria-label="关闭" onClick={() => setContactOpen(false)}>×</button><h2 id="contact-title">联系玩米</h2><p>请附上你感兴趣的完整域名。</p><div className="contact-list">{settings.contact_email && <a href={`mailto:${settings.contact_email}`}>邮箱 <strong>{settings.contact_email}</strong></a>}{settings.contact_telegram && <a href={`https://t.me/${settings.contact_telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Telegram <strong>{settings.contact_telegram}</strong></a>}{settings.contact_wechat && <button type="button" onClick={() => void copyText(settings.contact_wechat!).then((ok) => notify(ok ? "微信号已复制" : "复制失败", ok ? "success" : "error"))}>微信 <strong>{settings.contact_wechat}</strong></button>}{settings.wechat_qr_url && <img className="qr-code" src={settings.wechat_qr_url} alt="玩米微信二维码" loading="lazy" decoding="async" />}</div></div></div>}
      {importPreview && <div className="modal-backdrop" onMouseDown={() => setImportPreview(null)}><div className="contact-modal import-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="import-title"><button type="button" className="modal-close" aria-label="关闭" onClick={() => setImportPreview(null)}>×</button><h2 id="import-title">导入收藏预览</h2><p className="import-summary">共 {importPreview.total} 条：<b>新增 {importPreview.added}</b> 个，已存在 {importPreview.duplicate} 个{importPreview.newFolders ? `，新收藏夹 ${importPreview.newFolders} 个` : ""}。</p><p className="import-hint">已存在的域名默认保留你当前的备注与标签；选择「覆盖已存在」会用导入数据替换它们。收藏仅保存在当前浏览器。</p><div className="import-actions"><button type="button" className="secondary-button" onClick={() => setImportPreview(null)}>取消</button><button type="button" className="secondary-button" onClick={() => confirmImport("merge")}>合并保留</button><button type="button" className="primary-button" onClick={() => confirmImport("overwrite")} disabled={!importPreview.duplicate}>覆盖已存在</button></div></div></div>}
      <DomainDetailDialog domain={selectedDomain} candidates={catalogueItems} favorite={selectedDomain ? favorites.ids.has(selectedDomain.id) : false} entry={selectedDomain ? favorites.entryById.get(selectedDomain.id) ?? null : null} folders={favorites.folders} onClose={() => setSelectedDomain(null)} onCopy={copyDomain} onFavorite={toggleFavorite} onSelect={setSelectedDomain} onSetNote={favorites.setNote} onSetTags={favorites.setTags} onMoveFolder={favorites.moveToFolder} />
      <PublicBottomNav favoritesOnly={favoritesOnly} favoriteCount={favorites.items.length} onShowAll={() => setFavoritesOnly(false)} onShowFavorites={showFavorites} onRandom={discoverRandom} onAdvanced={() => setAdvancedOpen(true)} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
