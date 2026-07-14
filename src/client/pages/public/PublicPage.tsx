import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { api } from "../../lib/api";
import { copyText } from "../../lib/clipboard";
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
}

function initialFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") as SortKey | null;
  const group = params.get("group") as GroupKey | null;
  return {
    q: params.get("q") ?? "",
    tld: params.get("tld") ?? "",
    category: params.get("category") ?? "",
    group: group && ["all", "featured", "two", "three"].includes(group) ? group : "all",
    sort: sort && SORTS.some(([key]) => key === sort) ? sort : "default",
    page: Math.max(1, Number(params.get("page") ?? 1)),
  };
}

function groupParams(group: GroupKey): Record<string, string> {
  if (group === "featured") return { featured: "true" };
  if (group === "two") return { length: "2" };
  if (group === "three") return { length: "3" };
  return {};
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.1 4.1"/></svg>;
}

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
}

export function PublicPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [facets, setFacets] = useState<DomainFacets | null>(null);
  const [pageData, setPageData] = useState<Paginated<PublicDomain> | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [draftSearch, setDraftSearch] = useState(filters.q);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dataVersion = useRef("");

  const notify = useCallback((text: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    api<SiteSettings>("/api/public/settings").then((data) => {
      setSettings(data);
      document.documentElement.style.setProperty("--brand", data.accent_color);
      document.title = `${data.site_name} · 域名展示`;
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "站点设置加载失败"));
    api<DomainFacets>("/api/public/facets").then(setFacets).catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.tld) params.set("tld", filters.tld);
    if (filters.category) params.set("category", filters.category);
    if (filters.group !== "all") params.set("group", filters.group);
    if (filters.sort !== "default") params.set("sort", filters.sort);
    if (filters.page > 1) params.set("page", String(filters.page));
    window.history.replaceState(null, "", params.size ? `/?${params}` : "/");

    const apiParams = new URLSearchParams({
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.tld ? { tld: filters.tld } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...groupParams(filters.group),
      ...(filters.sort !== "default" ? { sort: filters.sort } : {}),
      page: String(filters.page), pageSize: "60",
    });
    setLoading(true);
    setError("");
    api<Paginated<PublicDomain>>(`/api/public/domains?${apiParams}`).then(setPageData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "域名加载失败"))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const result = await api<{ version: string }>("/api/public/version");
        if (!active) return;
        if (dataVersion.current && result.version !== dataVersion.current) setFilters((current) => ({ ...current }));
        dataVersion.current = result.version;
      } catch { /* 下一轮继续检查 */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!contactOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setContactOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [contactOpen]);

  const hasContact = Boolean(settings?.contact_email || settings?.contact_wechat || settings?.contact_telegram);
  const hasActiveFilter = Boolean(filters.q || filters.tld || filters.category || filters.group !== "all" || filters.sort !== "default");
  const categories = useMemo(() => [
    { value: "", label: "全部", count: facets?.total ?? 0, icon: "▦" },
    { value: "__featured", label: "精品", count: facets?.featuredCount ?? 0, icon: "☆" },
    ...(facets?.categories ?? []).map((category) => ({ value: category, label: category, count: facets?.categoryCounts[category] ?? 0, icon: CATEGORY_ICONS[category] ?? category.slice(0, 1) })),
  ], [facets]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftSearch.trim(), page: 1 }));
  }

  function resetFilters() {
    setDraftSearch("");
    setFilters({ q: "", tld: "", category: "", group: "all", sort: "default", page: 1 });
  }

  function selectCategory(value: string) {
    setFilters((current) => value === "__featured"
      ? { ...current, category: "", group: "featured", page: 1 }
      : { ...current, category: value, group: "all", page: 1 });
  }

  async function copyDomain(domain: string) {
    if (await copyText(domain)) notify(`已复制 ${domain}`);
    else notify("复制失败，请手动复制", "error");
  }

  return (
    <div className={`public-shell density-${settings?.display_density ?? "comfortable"}`}>
      <header className="public-header">
        <a className="brand" href="/" aria-label="玩米首页">
          {settings?.logo_url ? <img src={settings.logo_url} alt="玩米 Logo" /> : <span className="brand-mark">玩米</span>}
        </a>
        <nav>
          <a className="active" href="#domains">域名</a>
          {hasContact && <button className="text-button" onClick={() => setContactOpen(true)}>联系</button>}
        </nav>
        <div className="header-actions"><ThemeToggle /></div>
      </header>

      <main className="catalogue-layout" id="domains">
        <aside className="category-rail" aria-label="域名分类">
          <div className="category-list">
            {categories.slice(0, 8).map((option) => {
              const active = option.value === "__featured" ? filters.group === "featured" : filters.group !== "featured" && filters.category === option.value;
              return <button type="button" className={active ? "category-item active" : "category-item"} aria-pressed={active} key={option.value || "all"} onClick={() => selectCategory(option.value)}>
                <span className="category-icon" aria-hidden="true">{option.icon}</span><span className="category-label">{option.label}</span><span className="category-count">{option.count}</span>
              </button>;
            })}
            {categories.length > 8 && <button type="button" className="category-item more-categories" onClick={() => setCategoryOpen(true)}><span className="category-icon">＋</span><span className="category-label">更多</span><span className="category-count">{categories.length - 8}</span></button>}
          </div>
        </aside>

        <section className="domain-section">
          <div className="public-hero"><div className="hero-copy"><span className="eyebrow">WANMI DOMAIN COLLECTION</span><h1>发现一个<br /><em>好域名</em></h1><p>{settings?.site_bio || settings?.site_description || "精选易记、简短、有价值的域名，分类清晰，查找便捷。"}</p><form className="filter-search" onSubmit={submitSearch}>
            <SearchIcon /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="搜索完整域名，例如 wanmi.org" aria-label="搜索域名" />
            {draftSearch && <button className="search-clear" type="button" aria-label="清空搜索" onClick={() => { setDraftSearch(""); setFilters((current) => ({ ...current, q: "", page: 1 })); }}>×</button>}
            <button className="search-submit" type="submit">搜索</button>
          </form><div className="hero-chips">{pageData?.items.filter((item) => item.is_featured).slice(0, 3).map((item) => <a key={item.id} href={`/d/${encodeURIComponent(item.domain)}`}>{item.domain}</a>)}</div></div>{pageData?.items[0] && <button className="hero-domain-card" onClick={() => void copyDomain(pageData.items[0].domain)}><span>本期精选</span><strong>{pageData.items[0].name}<em>.{pageData.items[0].tld}</em></strong><p>{pageData.items[0].description || "点击复制这个域名"}</p><small>点击复制</small></button>}</div>

          {pageData && pageData.items.some((item) => item.is_featured) && <section className="featured-strip"><div><span>FEATURED</span><h2>精品域名</h2></div><div className="featured-scroller">{pageData.items.filter((item) => item.is_featured).slice(0, 8).map((item) => <a href={`/d/${encodeURIComponent(item.domain)}`} key={item.id}><strong>{item.name}<em>.{item.tld}</em></strong><span>{item.description || "值得关注的精品域名"}</span></a>)}</div></section>}

          <div className="catalogue-toolbar">
            <div className="toolbar-filters">
              <label><span>后缀</span><select aria-label="后缀筛选" value={filters.tld} onChange={(event) => setFilters((current) => ({ ...current, tld: event.target.value, page: 1 }))}><option value="">全部</option>{(facets?.tlds ?? []).map((tld) => <option key={tld} value={tld}>.{tld}</option>)}</select></label>
              <label><span>位数</span><select aria-label="位数筛选" value={["two", "three"].includes(filters.group) ? filters.group : "all"} onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value as GroupKey, page: 1 }))}><option value="all">全部</option><option value="two">2 位</option><option value="three">3 位</option></select></label>
            </div>
            <div className="sort-row" aria-label="排序"><span>排序</span>{SORTS.map(([key, label]) => <button type="button" key={key} className={filters.sort === key ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, sort: key, page: 1 }))}>{label}</button>)}</div>
            <div className="toolbar-summary"><span>{loading ? "正在读取…" : `共 ${pageData?.total ?? 0} 个域名`}</span><div className="view-switch"><button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>卡片</button><button className={viewMode === "compact" ? "active" : ""} onClick={() => setViewMode("compact")}>紧凑</button></div>{hasActiveFilter && <button type="button" className="clear-filter" onClick={resetFilters}>清除筛选</button>}</div>
          </div>

          {error && <div className="state-panel error-panel"><strong>加载失败</strong><span>{error}</span><button onClick={() => setFilters((current) => ({ ...current }))}>重试</button></div>}
          {loading && <div className="domain-list skeleton-list">{Array.from({ length: 8 }, (_, index) => <div className="domain-card skeleton" key={index} />)}</div>}
          {!loading && !error && pageData?.items.length === 0 && <div className="state-panel"><strong>没有匹配的域名</strong><span>换一个关键词，或清除筛选后再试。</span><button onClick={resetFilters}>清除筛选</button></div>}
          {!loading && !error && pageData && pageData.items.length > 0 && <div className={`domain-list ${viewMode === "compact" ? "compact-view" : "card-view"}`} role="list">
            {pageData.items.map((domain, index) => <div className={`domain-card${domain.is_featured ? " featured" : ""}`} role="listitem" key={domain.id} style={{ animationDelay: `${Math.min(index * 18, 280)}ms` }}>
              <a className="card-cover" href={`/d/${encodeURIComponent(domain.domain)}`} aria-label={`查看 ${domain.domain} 详情`} />
              <div className="domain-primary"><div className="domain-name"><strong>{domain.name}</strong><span>.{domain.tld}</span></div><div className="domain-tags">{domain.is_featured && <span className="chip chip-featured">精品</span>}{(domain.categories.length ? domain.categories : domain.category ? [domain.category] : []).map((category) => <span className="chip" key={category}>{category}</span>)}</div></div>
              <span className="domain-tld">.{domain.tld}</span><span className="domain-length">{domain.name.length}</span><p className="domain-description">{domain.description || "—"}</p>
              <div className="domain-actions"><button className="copy-button" title={`复制 ${domain.domain}`} onClick={() => void copyDomain(domain.domain)}><CopyIcon /><span>复制</span></button>{hasContact && <button className="contact-row-button" onClick={() => setContactOpen(true)}><MailIcon /><span>我想要</span></button>}<a href={`/d/${encodeURIComponent(domain.domain)}`}>详情 →</a></div>
            </div>)}
          </div>}

          {pageData && pageData.totalPages > 1 && <div className="pagination"><button disabled={pageData.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>上一页</button><span>第 {pageData.page} / {pageData.totalPages} 页</span><button disabled={pageData.page >= pageData.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button></div>}
        </section>
      </main>

      {categoryOpen && <div className="category-drawer-backdrop" onClick={() => setCategoryOpen(false)}><section className="category-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="更多分类"><header><h2>全部分类</h2><button onClick={() => setCategoryOpen(false)}>×</button></header><div>{categories.map((option) => <button key={option.value || "all"} onClick={() => { selectCategory(option.value); setCategoryOpen(false); }}><span>{option.icon}</span>{option.label}<small>{option.count}</small></button>)}</div></section></div>}

      <footer className="public-footer"><div><strong>{settings?.site_name ?? "玩米"}</strong><span>{settings?.copyright_text || `© ${new Date().getFullYear()} 保留所有权利`}</span></div>{settings?.icp_number && <span>{settings.icp_number}</span>}{hasContact && <button onClick={() => setContactOpen(true)}><MailIcon />联系我们</button>}{settings?.show_admin_link_in_footer && <a className="footer-admin-link" href="/admin">管理</a>}</footer>

      {contactOpen && settings && <div className="modal-backdrop" onMouseDown={() => setContactOpen(false)}><div className="contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="contact-title"><button className="modal-close" aria-label="关闭" onClick={() => setContactOpen(false)}>×</button><h2 id="contact-title">联系玩米</h2><p>请附上你感兴趣的完整域名。</p><div className="contact-list">{settings.contact_email && <a href={`mailto:${settings.contact_email}`}>邮箱 <strong>{settings.contact_email}</strong></a>}{settings.contact_telegram && <a href={`https://t.me/${settings.contact_telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Telegram <strong>{settings.contact_telegram}</strong></a>}{settings.contact_wechat && <button onClick={() => void copyText(settings.contact_wechat!).then((ok) => notify(ok ? "微信号已复制" : "复制失败", ok ? "success" : "error"))}>微信 <strong>{settings.contact_wechat}</strong></button>}{settings.wechat_qr_url && <img className="qr-code" src={settings.wechat_qr_url} alt="玩米微信二维码" />}</div></div></div>}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
