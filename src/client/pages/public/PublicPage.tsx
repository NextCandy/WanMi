import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContactIcons } from "../../components/ContactIcons";
import { DomainCard } from "../../components/DomainCard";
import { DomainDetailDialog } from "../../components/DomainDetailDialog";
import { PublicBottomNav } from "../../components/PublicBottomNav";
import { Toast, type ToastMessage } from "../../components/Toast";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useTracker } from "../../hooks/useTracker";
import { api } from "../../lib/api";
import { clearCatalogueCache, loadCatalogue } from "../../lib/catalogue-cache";
import { copyText } from "../../lib/clipboard";
import type { Paginated, PublicDomain, PublicHomeData } from "../../../shared/types/api";

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

type SortKey = "default" | "added_desc" | "length_asc" | "length_desc" | "tld_asc" | "random";
type GroupKey = "all" | "featured";

/* 高级筛选面板已移除；minLength/maxLength 仍由位数下拉驱动，
   contains/excludes/kind 保留 URL 直传兼容（无 UI 入口，API 仍支持）。 */
type DomainKind = "" | "digits" | "letters" | "alphanumeric" | "hyphen";

interface AdvancedFilterValue {
  minLength: string;
  maxLength: string;
  contains: string;
  excludes: string;
  kind: DomainKind;
}

const EMPTY_ADVANCED_FILTERS: AdvancedFilterValue = {
  minLength: "",
  maxLength: "",
  contains: "",
  excludes: "",
  kind: "",
};

const SORTS: Array<[SortKey, string]> = [
  ["default", "默认"],
  ["added_desc", "最新加入"],
  ["length_asc", "字符数升序"],
  ["length_desc", "字符数降序"],
  ["tld_asc", "后缀字母序"],
  ["random", "随机"],
];

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
  const group = params.get("group");
  const category = params.get("category") ?? "";
  const kind = params.get("kind") as DomainKind | null;
  const legacyLength = group === "two" ? "2" : group === "three" ? "3" : "";
  return {
    q: params.get("q") ?? "",
    tld: params.get("tld") ?? "",
    category: category === "精品" ? "" : category,
    group: category === "精品" || group === "featured" ? "featured" : "all",
    sort: sort && SORTS.some(([key]) => key === sort) ? sort : "default",
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
    advanced: {
      minLength: params.get("minLength") ?? legacyLength,
      maxLength: params.get("maxLength") ?? legacyLength,
      contains: params.get("contains") ?? "",
      excludes: params.get("excludes") ?? "",
      kind: kind && ["digits", "letters", "alphanumeric", "hyphen"].includes(kind) ? kind : "",
    },
  };
}

function groupParams(group: GroupKey): Record<string, string> {
  return group === "featured" ? { featured: "true" } : {};
}

function lengthPickOf(advanced: AdvancedFilterValue): string {
  if (!advanced.minLength && !advanced.maxLength) return "all";
  if (advanced.minLength === "10" && !advanced.maxLength) return "10plus";
  if (advanced.minLength && advanced.minLength === advanced.maxLength) {
    const value = Number(advanced.minLength);
    if (value >= 1 && value <= 9) return advanced.minLength;
  }
  return "custom";
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
    sort: filters.sort,
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

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.1 4.1"/></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>;
}

function pickRandomDomains(domains: PublicDomain[], count: number): PublicDomain[] {
  const shuffled = domains.filter((domain) => domain.is_featured).slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

export function PublicPage() {
  useTracker("/");
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [facets, setFacets] = useState<PublicHomeData | null>(null);
  const [pageData, setPageData] = useState<Paginated<PublicDomain> | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [draftSearch, setDraftSearch] = useState(filters.q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFocused, setHistoryFocused] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const [selectedDomain, setSelectedDomain] = useState<PublicDomain | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dataVersion = useRef("");
  const requestSequence = useRef(0);
  const history = useSearchHistory();

  const notify = useCallback((text: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      api<SiteSettings>("/api/public/settings"),
      api<PublicHomeData>("/api/public/facets"),
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
    if (filters.group === "featured") params.set("category", "精品");
    params.set("sort", filters.sort);
    if (filters.page > 1) params.set("page", String(filters.page));
    Object.entries(advancedParams(filters.advanced)).forEach(([key, value]) => params.set(key, value));
    const basePath = window.location.pathname.startsWith("/domains") ? "/domains" : "/";
    window.history.replaceState(null, "", params.size ? `${basePath}?${params}` : basePath);

    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    const url = catalogueUrl(filters);
    void loadCatalogue(url)
      .then((result) => {
        if (sequence !== requestSequence.current) return;
        setPageData(result);
      })
      .catch((reason: unknown) => {
        if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "域名加载失败");
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [filters]);

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

  const hasActiveFilter = Boolean(filters.q || filters.tld || filters.category || filters.group !== "all" || filters.sort !== "default" || hasAdvancedFilters(filters.advanced));
  const categories = useMemo(() => [
    { value: "", label: "全部", count: facets?.total_domains ?? 0 },
    { value: "__featured", label: "精品", count: facets?.total_featured ?? 0 },
    ...(facets?.categories ?? []).map((category) => ({ value: category, label: category, count: facets?.categoryCounts[category] ?? 0 })),
  ], [facets]);
  const catalogueItems = pageData?.items ?? [];
  const displayedItems = catalogueItems;
  const emptyRecommendations = useMemo(() => pickRandomDomains(facets?.featured_domains ?? [], 3), [facets?.featured_domains]);

  function applySearch(value: string) {
    const query = value.trim();
    setDraftSearch(query);
    if (query) history.add(query);
    setHistoryFocused(false);
    setFilters((current) => ({ ...current, q: query, page: 1 }));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    applySearch(draftSearch);
  }

  function resetFilters() {
    setDraftSearch("");
    setHistoryFocused(false);
    setFilters({ q: "", tld: "", category: "", group: "all", sort: "default", page: 1, advanced: EMPTY_ADVANCED_FILTERS });
  }

  function selectCategory(value: string) {
    setFilters((current) => value === "__featured"
      ? { ...current, category: "", group: "featured", page: 1 }
      : { ...current, category: value, group: "all", page: 1 });
  }

  const copyDomain = useCallback(async (domain: string) => {
    if (await copyText(domain)) notify(`已复制 ${domain}`);
    else notify("复制失败，请手动复制", "error");
  }, [notify]);

  return (
    <div className={`public-shell density-${settings?.display_density ?? "comfortable"}`}>
      <header className="public-header">
        <a className="brand" href="/" aria-label="玩米首页">
          <img className="brand-icon" src="/favicon.svg" alt="玩米 Logo" decoding="async" fetchPriority="high" />
        </a>
        <div className="header-actions">
          {settings?.show_admin_link_in_footer && <a className="admin-link" href="/admin">后台</a>}
        </div>
      </header>

      <main className="catalogue-layout">
        <section className="brand-statement">
          <h1>精选域名资产</h1>
          <p>{facets ? `${facets.total_domains.toLocaleString("zh-CN")} 个域名，覆盖 ${facets.total_tlds} 个后缀，其中 ${facets.total_featured} 个精选。` : "精选短字符域名的展示目录。"}为你的下一个项目找到合适的域名。</p>
        </section>

        <section className="domain-section" id="domains" aria-label="全部资产">
          <div className="catalogue-toolbar">
            <div
              className="search-area"
              onFocus={() => setHistoryFocused(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHistoryFocused(false);
              }}
            >
              <form className="filter-search" onSubmit={submitSearch}>
                <SearchIcon /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="输入域名或关键词，例如 wanmi" aria-label="搜索域名" autoComplete="off" />
                {draftSearch && <button className="search-clear" type="button" aria-label="清空搜索" onClick={() => { setDraftSearch(""); setFilters((current) => ({ ...current, q: "", page: 1 })); }}>×</button>}
                <button className="search-submit" type="submit">搜索</button>
              </form>
              {historyFocused && history.items.length > 0 && <div className="search-history" role="region" aria-label="最近搜索"><header><strong>最近搜索</strong><button type="button" className="clear-search-history" aria-label="清除搜索历史" title="清除搜索历史" onClick={history.clear}><TrashIcon /></button></header>{history.items.map((item) => <div key={item}><button type="button" onClick={() => applySearch(item)}>{item}</button><button type="button" aria-label={`删除搜索记录 ${item}`} onClick={() => history.remove(item)}>×</button></div>)}</div>}
            </div>
            <div className="toolbar-filters">
              <label><span>分类</span><select aria-label="分类筛选" value={filters.group === "featured" ? "__featured" : filters.category} onChange={(event) => selectCategory(event.target.value)}>{categories.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}{option.count > 0 ? `（${option.count}）` : ""}</option>)}</select></label>
              <label><span>后缀</span><select aria-label="后缀筛选" value={filters.tld} onChange={(event) => { setFilters((current) => ({ ...current, tld: event.target.value, page: 1 })); }}><option value="">全部</option>{(facets?.tlds ?? []).map((tld) => <option key={tld} value={tld}>.{tld}</option>)}</select></label>
              <label><span>位数</span><select aria-label="位数筛选" value={lengthPickOf(filters.advanced)} onChange={(event) => {
                const pick = event.target.value;
                const range = pick === "all" ? { minLength: "", maxLength: "" } : pick === "10plus" ? { minLength: "10", maxLength: "" } : { minLength: pick, maxLength: pick };
                setFilters((current) => ({ ...current, advanced: { ...current.advanced, ...range }, page: 1 }));
              }}>
                <option value="all">全部</option>
                {lengthPickOf(filters.advanced) === "custom" && <option value="custom" disabled>自定义区间</option>}
                {Array.from({ length: 9 }, (_, index) => String(index + 1)).map((value) => <option key={value} value={value}>{value} 位</option>)}
                <option value="10plus">10 位以上</option>
              </select></label>
              <label className="sort-control"><span>排序</span><select aria-label="排序方式" value={filters.sort} onChange={(event) => { setFilters((current) => ({ ...current, sort: event.target.value as SortKey, page: 1 })); }}>{SORTS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
            </div>
            <div className="toolbar-summary"><span>{loading ? "正在读取…" : `共 ${pageData?.total ?? 0} 个域名`}</span><div className="view-switch"><button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>卡片</button><button type="button" className={viewMode === "compact" ? "active" : ""} onClick={() => setViewMode("compact")}>紧凑</button></div>{hasActiveFilter && <button type="button" className="clear-filter" onClick={resetFilters}>清除筛选</button>}</div>
          </div>

          {error && <div className="state-panel error-panel"><strong>加载失败</strong><span>{error}</span><button type="button" onClick={() => { clearCatalogueCache(); setFilters((current) => ({ ...current })); }}>重试</button></div>}
          {loading && <div className="domain-list skeleton-list">{Array.from({ length: 8 }, (_, index) => <div className="domain-card skeleton" key={index} />)}</div>}
          {!loading && !error && pageData?.items.length === 0 && <section className="empty-results" aria-labelledby="empty-results-title">
            <div className="state-panel"><h3 id="empty-results-title">未找到匹配的域名</h3><span>换一个关键词，或清除筛选后再试。</span><button type="button" onClick={resetFilters}>清除筛选</button></div>
            {emptyRecommendations.length > 0 && <div className="empty-recommendations"><header><span>为你推荐</span><h3>试试这些精选域名</h3></header><div className="domain-list card-view">{emptyRecommendations.map((domain) => <DomainCard key={domain.id} domain={domain} onCopy={copyDomain} onQuickView={setSelectedDomain} />)}</div></div>}
          </section>}
          {displayedItems.length > 0 && !loading && <div className={`domain-list ${viewMode === "compact" ? "compact-view" : "card-view"}`}>
            {displayedItems.map((domain) => <DomainCard
              key={domain.id}
              domain={domain}
              onCopy={copyDomain}
              onQuickView={setSelectedDomain}
            />)}
          </div>}

          {pageData && pageData.totalPages > 1 && <nav className="pagination" aria-label="域名分页"><button type="button" disabled={pageData.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>上一页</button><div>{pageItems(pageData.page, pageData.totalPages).map((item) => typeof item === "number" ? <button type="button" key={item} className={pageData.page === item ? "active" : ""} aria-current={pageData.page === item ? "page" : undefined} onClick={() => setFilters((current) => ({ ...current, page: item }))}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div><button type="button" disabled={pageData.page >= pageData.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button></nav>}
        </section>
      </main>


      <footer className="public-footer footer-grid">
        <div className="footer-brand">
          <div className="footer-brand-row">
            <strong>{settings?.site_name ?? "玩米"}</strong>
            <span className="footer-dot" aria-hidden="true">·</span>
            <span>{settings?.copyright_text || `© ${new Date().getFullYear()} 保留所有权利`}</span>
          </div>
          {settings?.icp_number && <span className="footer-icp">{settings.icp_number}</span>}
        </div>
        {settings && <ContactIcons settings={settings} notify={notify} />}
        <div className="footer-right" />
      </footer>

      <DomainDetailDialog domain={selectedDomain} candidates={catalogueItems} onClose={() => setSelectedDomain(null)} onCopy={copyDomain} onSelect={setSelectedDomain} />
      <PublicBottomNav />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
