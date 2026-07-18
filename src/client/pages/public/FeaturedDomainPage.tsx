import type { FeaturedDomainDetail, FeaturedDomainRecommendation } from "../../../shared/types/api";
import { useTracker } from "../../hooks/useTracker";

function readFeaturedDomainDetail(): FeaturedDomainDetail | null {
  const element = document.getElementById("featured-domain-data");
  if (!element?.textContent) return null;
  try {
    return JSON.parse(element.textContent) as FeaturedDomainDetail;
  } catch {
    return null;
  }
}

function recommendationHref(item: FeaturedDomainRecommendation): string {
  return item.is_featured
    ? `/d/${encodeURIComponent(item.domain)}`
    : `/domains?q=${encodeURIComponent(item.domain)}`;
}

function RecommendationGroup({ title, items }: { title: string; items: FeaturedDomainRecommendation[] }) {
  if (!items.length) return null;
  return (
    <section className="featured-related-group">
      <h3>{title}</h3>
      <div className="featured-related-grid">
        {items.map((item) => (
          <a className="featured-related-card" href={recommendationHref(item)} key={item.id}>
            <span>{item.domain}</span>
            <small>{item.is_featured ? "查看详情" : "目录搜索"} →</small>
          </a>
        ))}
      </div>
    </section>
  );
}

export function FeaturedDomainPage() {
  const detail = readFeaturedDomainDetail();
  useTracker(window.location.pathname);

  if (!detail) {
    return <div className="app-loading"><img className="brand-mark-img" src="/logo.svg" alt="玩米" /><p>正在打开精选域名…</p></div>;
  }

  const domain = detail.domain;
  const categories = domain.categories;
  const updatedAt = domain.updated_at ? domain.updated_at.slice(0, 10) : "—";

  return (
    <div className="featured-detail-shell">
      <header className="featured-detail-header">
        <a className="brand" href="/" aria-label={`${detail.site.name}首页`}>{detail.site.logo_url ? <img src={detail.site.logo_url} alt="" decoding="async" /> : <img className="brand-mark-img" src="/logo.svg" alt="" decoding="async" />}<span>{detail.site.name}</span></a>
        <nav aria-label="详情页导航"><a href="/">首页</a><a href="/domains">域名目录</a></nav>
        <a className="featured-detail-browse" href="/domains">浏览全部域名</a>
      </header>
      <main className="featured-detail-main">
        <a className="featured-detail-back" href="/domains">← 返回域名目录</a>
        <section className="featured-detail-hero">
          <h1>{domain.domain}</h1>
          {categories.length > 0 && <div className="featured-detail-tags" aria-label={`${domain.domain} 分类`}>{categories.map((category) => <span key={category}>{category}</span>)}</div>}
          {domain.description && <p className="featured-detail-description">{domain.description}</p>}
          <dl className="featured-detail-meta">
            <div><dt>后缀</dt><dd>.{domain.tld}</dd></div>
            <div><dt>字符数</dt><dd>{domain.character_count}</dd></div>
            <div><dt>类型</dt><dd>{domain.type}</dd></div>
            <div><dt>注册商</dt><dd>{domain.registrar_name ?? "—"}</dd></div>
            <div><dt>更新时间</dt><dd>{updatedAt}</dd></div>
          </dl>
          <a className="featured-detail-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow">访问该域名 →</a>
        </section>
        <section className="featured-related" aria-labelledby="featured-related-title">
          <div className="featured-related-heading"><h2 id="featured-related-title">相似域名推荐</h2></div>
          <RecommendationGroup title={`同后缀 .${domain.tld}`} items={detail.same_tld} />
          <RecommendationGroup title={`同为 ${domain.character_count} 字符`} items={detail.same_length} />
        </section>
      </main>
      <footer className="featured-detail-footer"><span>{detail.site.name} · 精选域名资产</span><a href="/">wanmi.org</a></footer>
    </div>
  );
}
