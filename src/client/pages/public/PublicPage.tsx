import { FormEvent, useCallback, useEffect, useState } from "react";

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
}

interface DomainFacets {
  tlds: string[];
  categories: string[];
  total: number;
  tldCount: number;
  latestAddedAt: string | null;
}

type SortKey = "default" | "added_desc" | "length_asc" | "domain_asc";
type GroupKey = "all" | "featured" | "two" | "three" | "digits";

const SORTS: Array<[SortKey, string]> = [
  ["default", "默认"],
  ["added_desc", "最新添加"],
  ["length_asc", "位数"],
  ["domain_asc", "字母序"],
];
const GROUPS: Array<[GroupKey, string]> = [
  ["all", "全部"],
  ["featured", "精品"],
  ["two", "二字符"],
  ["three", "三字符"],
  ["digits", "数字"],
];

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
    group: group && GROUPS.some(([key]) => key === group) ? group : "all",
    sort: sort && SORTS.some(([key]) => key === sort) ? sort : "default",
    page: Number(params.get("page") ?? 1),
  };
}

function groupParams(group: GroupKey): Record<string, string> {
  if (group === "featured") return { featured: "true" };
  if (group === "two") return { length: "2" };
  if (group === "three") return { length: "3" };
  if (group === "digits") return { kind: "digits" };
  return {};
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
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((text: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    api<SiteSettings>("/api/public/settings")
      .then((data) => {
        setSettings(data);
        document.documentElement.style.setProperty("--brand", data.accent_color);
        document.title = `${data.site_name} · 域名展示`;
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "站点设置加载失败"));
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
    const shareQuery = params.toString();
    window.history.replaceState(null, "", shareQuery ? `/?${shareQuery}` : "/");

    const apiParams = new URLSearchParams({
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.tld ? { tld: filters.tld } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...groupParams(filters.group),
      ...(filters.sort !== "default" ? { sort: filters.sort } : {}),
      page: String(filters.page),
      pageSize: "60",
    });
    setLoading(true);
    setError("");
    api<Paginated<PublicDomain>>(`/api/public/domains?${apiParams.toString()}`)
      .then(setPageData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "域名加载失败"))
      .finally(() => setLoading(false));
  }, [filters]);

  const hasContact = Boolean(settings?.contact_email || settings?.contact_wechat || settings?.contact_telegram);
  const hasActiveFilter = Boolean(filters.q || filters.tld || filters.category || filters.group !== "all" || filters.sort !== "default");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftSearch.trim(), page: 1 }));
  }

  async function copyDomain(domain: string) {
    if (await copyText(domain)) notify(`已复制 ${domain}`);
    else notify("复制失败，请手动复制", "error");
  }

  const latestAdded = facets?.latestAddedAt ? new Date(facets.latestAddedAt).toLocaleDateString("zh-CN") : null;

  return (
    <div className={`public-shell density-${settings?.display_density ?? "comfortable"}`}>
      <header className="public-header">
        <a className="brand" href="/" aria-label="玩米首页">
          {settings?.logo_url ? <img src={settings.logo_url} alt="玩米 Logo" /> : <span className="brand-mark">玩</span>}
          <span>{settings?.site_name ?? "玩米"}</span>
        </a>
        <nav>
          {facets && (
            <div className="header-stats" aria-label="站点统计">
              <span><strong>{facets.total}</strong> 域名</span>
              <span><strong>{facets.tldCount}</strong> 后缀</span>
              {latestAdded && <span>更新于 <strong>{latestAdded}</strong></span>}
            </div>
          )}
          <a href="#domains">域名</a>
          {hasContact && <button className="text-button" onClick={() => setContactOpen(true)}>联系</button>}
          <ThemeToggle />
          <a className="admin-link" href="/admin">管理后台</a>
        </nav>
      </header>

      <main>
        <section className="domain-section" id="domains">
          <div className="filter-bar">
            <form className="filter-search" onSubmit={submitSearch}>
              <span aria-hidden="true">⌕</span>
              <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="搜索完整域名，例如 wanmi.org" aria-label="搜索域名" />
              <button type="submit">搜索</button>
            </form>
            <select value={filters.tld} onChange={(event) => setFilters((current) => ({ ...current, tld: event.target.value, page: 1 }))} aria-label="后缀筛选">
              <option value="">全部后缀</option>
              {(facets?.tlds ?? []).map((tld) => <option key={tld} value={tld}>.{tld}</option>)}
            </select>
            {(facets?.categories.length ?? 0) > 0 && (
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value, page: 1 }))} aria-label="分类筛选">
                <option value="">全部分类</option>
                {facets!.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            )}
            {hasActiveFilter && (
              <button className="clear-filter" onClick={() => { setDraftSearch(""); setFilters({ q: "", tld: "", category: "", group: "all", sort: "default", page: 1 }); }}>清除筛选</button>
            )}
          </div>

          <div className="sort-row" aria-label="排序">
            <span>排序</span>
            {SORTS.map(([key, label]) => (
              <button key={key} className={filters.sort === key ? "active" : ""}
                onClick={() => setFilters((current) => ({ ...current, sort: key, page: 1 }))}>{label}</button>
            ))}
            <span className="result-count">{loading ? "正在读取…" : `共 ${pageData?.total ?? 0} 个域名`}</span>
          </div>

          {error && <div className="state-panel error-panel"><strong>加载失败</strong><span>{error}</span><button onClick={() => setFilters((current) => ({ ...current }))}>重试</button></div>}
          {loading && <div className="domain-grid skeleton-grid">{Array.from({ length: 15 }, (_, index) => <div className="domain-card skeleton" key={index} />)}</div>}
          {!loading && !error && pageData?.items.length === 0 && <div className="state-panel"><strong>没有匹配的域名</strong><span>换一个关键词或清除筛选试试。</span></div>}
          {!loading && !error && pageData && pageData.items.length > 0 && (
            <div className="domain-grid">
              {pageData.items.map((domain, index) => {
                const length = domain.domain.length;
                const long = length > 20 ? " domain-long" : length > 14 ? " domain-medium" : length <= 7 ? " domain-short" : length <= 10 ? " domain-mid" : "";
                return (
                  <div className={`domain-card${domain.is_featured ? " featured" : ""}`} key={domain.id} style={{ animationDelay: `${Math.min(index * 22, 420)}ms` }}>
                    {domain.is_featured && <span className="premium-corner">精品</span>}
                    <a className="card-cover" href={`/d/${encodeURIComponent(domain.domain)}`} aria-label={`查看 ${domain.domain} 详情`} />
                    <div className={`domain-name${long}`}><strong>{domain.name}</strong><span>.{domain.tld}</span></div>
                    <div className="domain-meta">
                      <span className="chip chip-brand">.{domain.tld}</span>
                      <span className="chip">{domain.name.length} 位</span>
                    </div>
                    <button className="copy-button" title={`复制 ${domain.domain}`} onClick={() => void copyDomain(domain.domain)}>⧉</button>
                  </div>
                );
              })}
            </div>
          )}

          {pageData && pageData.totalPages > 1 && (
            <div className="pagination">
              <button disabled={pageData.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>上一页</button>
              <span>第 {pageData.page} / {pageData.totalPages} 页</span>
              <button disabled={pageData.page >= pageData.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
            </div>
          )}
        </section>
      </main>

      <footer className="public-footer">
        <div className="brand footer-brand"><span className="brand-mark">玩</span><span>{settings?.site_name ?? "玩米"}</span></div>
        <span>{settings?.copyright_text || `© ${new Date().getFullYear()} ${settings?.site_name ?? "玩米"}`}</span>
        {settings?.icp_number && <span>{settings.icp_number}</span>}
      </footer>

      {contactOpen && settings && (
        <div className="modal-backdrop" onMouseDown={() => setContactOpen(false)}>
          <div className="contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="联系玩米">
            <button className="modal-close" onClick={() => setContactOpen(false)}>×</button>
            <span className="section-kicker">CONTACT</span>
            <h2>联系玩米</h2>
            <p>请附上你感兴趣的完整域名。</p>
            <div className="contact-list">
              {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>邮箱 <strong>{settings.contact_email}</strong></a>}
              {settings.contact_telegram && <a href={`https://t.me/${settings.contact_telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Telegram <strong>{settings.contact_telegram}</strong></a>}
              {settings.contact_wechat && <button onClick={() => void copyText(settings.contact_wechat!).then((ok) => notify(ok ? "微信号已复制" : "复制失败", ok ? "success" : "error"))}>微信 <strong>{settings.contact_wechat}</strong></button>}
              {settings.wechat_qr_url && <img className="qr-code" src={settings.wechat_qr_url} alt="玩米微信二维码" />}
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
