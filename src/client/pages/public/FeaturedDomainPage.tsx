import type { FeaturedDomainDetail, FeaturedDomainRecommendation } from "../../../shared/types/api";
import { useTracker } from "../../hooks/useTracker";
import { categoryLabel } from "../../lib/category-label";

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
            <small>{item.is_featured ? "View details" : "Search catalog"} →</small>
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
    return <div className="app-loading"><img className="brand-mark-img" src="/unusedomain-logo.png" alt="UnUseDomain" /><p>Opening featured domain…</p></div>;
  }

  const domain = detail.domain;
  const categories = domain.categories;
  const updatedAt = domain.updated_at ? domain.updated_at.slice(0, 10) : "—";

  return (
    <div className="featured-detail-shell">
      <header className="featured-detail-header">
        <a className="brand" href="/" aria-label={`${detail.site.name} home`}>{detail.site.logo_url ? <img src={detail.site.logo_url} alt="" decoding="async" /> : <img className="brand-mark-img" src="/unusedomain-logo.png" alt="" decoding="async" />}<span>{detail.site.name}</span></a>
        <nav aria-label="Detail navigation"><a href="/">Home</a><a href="/domains">Catalog</a></nav>
        <a className="featured-detail-browse" href="/domains">Browse all domains</a>
      </header>
      <main className="featured-detail-main">
        <a className="featured-detail-back" href="/domains">← Back to catalog</a>
        <section className="featured-detail-hero">
          <span className="featured-detail-kicker">★ Featured</span>
          <h1>{domain.domain}</h1>
          {categories.length > 0 && <div className="featured-detail-tags" aria-label={`${domain.domain} categories`}>{categories.map((category) => <span key={category}>{categoryLabel(category)}</span>)}</div>}
          {domain.description && <p className="featured-detail-description">{domain.description}</p>}
          <dl className="featured-detail-meta">
            <div><dt>TLD</dt><dd>.{domain.tld}</dd></div>
            <div><dt>Characters</dt><dd>{domain.character_count}</dd></div>
            <div><dt>Type</dt><dd>{domain.type}</dd></div>
            <div><dt>Registrar</dt><dd>{domain.registrar_name ?? "—"}</dd></div>
            <div><dt>Updated</dt><dd>{updatedAt}</dd></div>
          </dl>
          <a className="featured-detail-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow">Visit this domain →</a>
        </section>
        <section className="featured-related" aria-labelledby="featured-related-title">
          <div className="featured-related-heading"><h2 id="featured-related-title">Similar domains</h2></div>
          <RecommendationGroup title={`Same TLD .${domain.tld}`} items={detail.same_tld} />
          <RecommendationGroup title={`Same length: ${domain.character_count} chars`} items={detail.same_length} />
        </section>
      </main>
      <footer className="featured-detail-footer"><span>{detail.site.name} · Featured domains</span><a href="/">unusedomain.com</a></footer>
    </div>
  );
}
