import { FormEvent, useCallback, useEffect, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { api } from "../../lib/api";

interface SiteSettings {
  site_name: string;
  site_description: string;
  logo_url: string | null;
  accent_color: string;
  display_density: string;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  wechat_qr_url: string | null;
  show_prices: boolean;
}

interface DomainCard {
  id: number;
  domain: string;
  name: string;
  tld: string;
  category: string | null;
  is_featured: boolean;
  public_price?: string | null;
}

interface DomainPage {
  items: DomainCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface DomainFacets {
  tlds: string[];
  categories: string[];
}

function initialFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    tld: params.get("tld") ?? "",
    length: params.get("length") ?? "",
    category: params.get("category") ?? "",
    featured: params.get("featured") ?? "",
    page: Number(params.get("page") ?? 1),
  };
}

export function PublicPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [facets, setFacets] = useState<DomainFacets>({ tlds: [], categories: [] });
  const [pageData, setPageData] = useState<DomainPage | null>(null);
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
    api<DomainFacets>("/api/public/facets")
      .then(setFacets)
      .catch(() => setFacets({ tlds: [], categories: [] }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value && !(key === "page" && value === 1)) params.set(key, String(value));
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
    setLoading(true);
    setError("");
    api<DomainPage>(`/api/public/domains?${params.toString()}&pageSize=60`)
      .then(setPageData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "域名加载失败"))
      .finally(() => setLoading(false));
  }, [filters]);

  const hasContact = Boolean(settings?.contact_email || settings?.contact_wechat || settings?.contact_telegram);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftSearch.trim(), page: 1 }));
  }

  async function copyDomain(domain: string) {
    try {
      await navigator.clipboard.writeText(domain);
      notify(`已复制 ${domain}`);
    } catch {
      notify("复制失败，请手动复制", "error");
    }
  }

  return (
    <div className={`public-shell density-${settings?.display_density ?? "comfortable"}`}>
      <header className="public-header">
        <a className="brand" href="/" aria-label="WanMi 首页">
          {settings?.logo_url ? <img src={settings.logo_url} alt="WanMi Logo" /> : <span className="brand-mark">W</span>}
          <span>{settings?.site_name ?? "WanMi"}</span>
        </a>
        <nav>
          <a href="#domains">域名</a>
          {hasContact && <button className="text-button" onClick={() => setContactOpen(true)}>联系</button>}
          <ThemeToggle />
          <a className="admin-link" href="/admin">管理后台</a>
        </nav>
      </header>

      <main>
        <section className="domain-section" id="domains">
          <div className="section-heading">
            <div>
              <span className="section-kicker">WANMI DOMAINS</span>
              <h2>域名收藏</h2>
            </div>
            <span className="result-count">{loading ? "正在读取…" : `共 ${pageData?.total ?? 0} 个域名`}</span>
          </div>

          <div className="filter-bar">
            <form className="filter-search" onSubmit={submitSearch}>
              <span aria-hidden="true">⌕</span>
              <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="搜索完整域名，例如 wanmi.org" aria-label="搜索域名" />
              <button type="submit">搜索</button>
            </form>
            <select value={filters.tld} onChange={(event) => setFilters((current) => ({ ...current, tld: event.target.value, page: 1 }))} aria-label="后缀筛选">
              <option value="">全部后缀</option>
              {facets.tlds.map((tld) => <option key={tld} value={tld}>.{tld}</option>)}
            </select>
            <select value={filters.length} onChange={(event) => setFilters((current) => ({ ...current, length: event.target.value, page: 1 }))} aria-label="字符位数筛选">
              <option value="">全部位数</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((length) => <option key={length} value={length}>{length} 位</option>)}
            </select>
            {facets.categories.length > 0 && (
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value, page: 1 }))} aria-label="分类筛选">
                <option value="">全部分类</option>
                {facets.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            )}
            <label className="featured-toggle">
              <input type="checkbox" checked={filters.featured === "true"} onChange={(event) => setFilters((current) => ({ ...current, featured: event.target.checked ? "true" : "", page: 1 }))} />
              只看精品
            </label>
            {(filters.q || filters.tld || filters.length || filters.category || filters.featured) && (
              <button className="clear-filter" onClick={() => { setDraftSearch(""); setFilters({ q: "", tld: "", length: "", category: "", featured: "", page: 1 }); }}>清除筛选</button>
            )}
          </div>

          {error && <div className="state-panel error-panel"><strong>加载失败</strong><span>{error}</span><button onClick={() => setFilters((current) => ({ ...current }))}>重试</button></div>}
          {loading && <div className="domain-grid skeleton-grid">{Array.from({ length: 18 }, (_, index) => <div className="domain-card skeleton" key={index} />)}</div>}
          {!loading && !error && pageData?.items.length === 0 && <div className="state-panel"><strong>没有匹配的域名</strong><span>换一个关键词或清除筛选试试。</span></div>}
          {!loading && !error && pageData && pageData.items.length > 0 && (
            <div className="domain-grid">
              {pageData.items.map((domain, index) => {
                const long = domain.domain.length > 20 ? " domain-long" : domain.domain.length > 14 ? " domain-medium" : "";
                return (
                  <button className={`domain-card${domain.is_featured ? " featured" : ""}`} key={domain.id} style={{ animationDelay: `${Math.min(index * 22, 420)}ms` }} onClick={() => void copyDomain(domain.domain)} title={`复制 ${domain.domain}`}>
                    <div className="domain-card-top">
                      {domain.is_featured ? <span className="featured-badge">精品</span> : <span />}
                      <span className="copy-hint">点击复制</span>
                    </div>
                    <div className={`domain-name${long}`}><strong>{domain.name}</strong><span>.{domain.tld}</span></div>
                    <div className="domain-meta">
                      {domain.category ? <span>{domain.category}</span> : <span>WanMi 收藏</span>}
                      {settings?.show_prices && domain.public_price && <span className="public-price">{domain.public_price}</span>}
                    </div>
                  </button>
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
        <div className="brand footer-brand"><span className="brand-mark">W</span><span>{settings?.site_name ?? "WanMi"}</span></div>
        <span>{settings?.copyright_text || `© ${new Date().getFullYear()} WanMi`}</span>
        {settings?.icp_number && <span>{settings.icp_number}</span>}
      </footer>

      {contactOpen && settings && (
        <div className="modal-backdrop" onMouseDown={() => setContactOpen(false)}>
          <div className="contact-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="联系 WanMi">
            <button className="modal-close" onClick={() => setContactOpen(false)}>×</button>
            <span className="section-kicker">CONTACT</span>
            <h2>联系 WanMi</h2>
            <p>请附上你感兴趣的完整域名。</p>
            <div className="contact-list">
              {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>邮箱 <strong>{settings.contact_email}</strong></a>}
              {settings.contact_telegram && <a href={`https://t.me/${settings.contact_telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">Telegram <strong>{settings.contact_telegram}</strong></a>}
              {settings.contact_wechat && <button onClick={() => void navigator.clipboard.writeText(settings.contact_wechat!).then(() => notify("微信号已复制"))}>微信 <strong>{settings.contact_wechat}</strong></button>}
              {settings.wechat_qr_url && <img className="qr-code" src={settings.wechat_qr_url} alt="WanMi 微信二维码" />}
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
