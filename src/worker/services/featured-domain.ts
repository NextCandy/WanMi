import type {
  FeaturedDomainDetail,
  FeaturedDomainRecommendation,
  FeaturedDomainRecord,
} from "../../shared/types/api";

interface FeaturedDomainRow {
  id: number;
  domain: string;
  name: string;
  tld: string;
  description: string;
  manual_category: string | null;
  category: string | null;
  auto_categories: string | null;
  is_featured: number;
  registered_at: string | null;
  expires_at: string | null;
  registrar_name: string | null;
  updated_at: string;
}

interface RecommendationRow {
  id: number;
  domain: string;
  name: string;
  tld: string;
  is_featured: number;
}

const DETAIL_SELECT = `SELECT d.id, d.full_domain AS domain, d.name, d.tld,
  COALESCE(d.description, '') AS description,
  NULLIF(d.category, '') AS manual_category,
  COALESCE(NULLIF(d.category, ''), NULLIF(d.auto_category, '')) AS category,
  (SELECT GROUP_CONCAT(dac.category, '|') FROM domain_auto_categories dac WHERE dac.domain_id = d.id) AS auto_categories,
  d.is_featured, d.registered_at, d.expires_at, NULLIF(d.registrar_name, '') AS registrar_name,
  d.updated_at
  FROM domains d`;

const RECOMMENDATION_SELECT = `SELECT d.id, d.full_domain AS domain, d.name, d.tld, d.is_featured
  FROM domains d`;

function categoriesFor(row: FeaturedDomainRow): string[] {
  if (row.manual_category) return [row.manual_category];
  return row.auto_categories?.split("|").filter(Boolean) ?? (row.category ? [row.category] : []);
}

function serializeRecommendation(row: RecommendationRow): FeaturedDomainRecommendation {
  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    is_featured: row.is_featured === 1,
  };
}

export function featuredDomainDescription(domain: FeaturedDomainRecord): string {
  return domain.description || `${domain.domain} is a featured domain on UnUseDomain — short, memorable, and well suited to brands, products and digital projects.`;
}

export async function loadFeaturedDomainDetail(db: D1Database, normalizedDomain: string): Promise<FeaturedDomainDetail | null> {
  const row = await db.prepare(
    `${DETAIL_SELECT} WHERE d.normalized_domain = ? AND d.is_listed = 1 AND d.is_featured = 1 LIMIT 1`,
  ).bind(normalizedDomain).first<FeaturedDomainRow>();
  if (!row) return null;

  const characterCount = Array.from(row.name.replaceAll(".", "")).length;
  const [sameTldResult, sameLengthResult, settingsResult] = await db.batch([
    db.prepare(
      `${RECOMMENDATION_SELECT}
       WHERE d.is_listed = 1 AND d.id <> ? AND d.tld = ?
       ORDER BY d.is_featured DESC, length(replace(d.name, '.', '')) ASC, d.normalized_domain ASC
       LIMIT 3`,
    ).bind(row.id, row.tld),
    db.prepare(
      `${RECOMMENDATION_SELECT}
       WHERE d.is_listed = 1 AND d.id <> ? AND d.tld <> ? AND length(replace(d.name, '.', '')) = ?
       ORDER BY d.is_featured DESC, d.normalized_domain ASC
       LIMIT 3`,
    ).bind(row.id, row.tld, characterCount),
    db.prepare("SELECT site_name, site_description, logo_url, favicon_url FROM site_settings WHERE id = 1"),
  ]);

  const categories = categoriesFor(row);
  const domain: FeaturedDomainRecord = {
    id: row.id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    description: row.description,
    category: row.category,
    categories,
    is_featured: true,
    registered_at: row.registered_at,
    expires_at: row.expires_at,
    registrar_name: row.registrar_name,
    updated_at: row.updated_at,
    character_count: characterCount,
    type: categories[0] ?? row.category ?? "Featured",
  };
  const settings = settingsResult.results[0] as { site_name?: string; site_description?: string; logo_url?: string | null; favicon_url?: string | null } | undefined;

  return {
    domain,
    same_tld: (sameTldResult.results as unknown as RecommendationRow[]).map(serializeRecommendation),
    same_length: (sameLengthResult.results as unknown as RecommendationRow[]).map(serializeRecommendation),
    site: {
      name: settings?.site_name || "UnUseDomain",
      description: settings?.site_description || "Featured domain gallery",
      logo_url: settings?.logo_url ?? null,
      favicon_url: settings?.favicon_url ?? null,
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function detailRecommendationMarkup(title: string, items: FeaturedDomainRecommendation[]): string {
  if (!items.length) return "";
  const cards = items.map((item) => {
    const href = item.is_featured
      ? `/d/${encodeURIComponent(item.domain)}`
      : `/domains?q=${encodeURIComponent(item.domain)}`;
    return `<a class="featured-related-card" href="${href}"><span>${escapeHtml(item.domain)}</span><small>${item.is_featured ? "View details" : "Search catalog"} →</small></a>`;
  }).join("");
  return `<section class="featured-related-group"><h3>${escapeHtml(title)}</h3><div class="featured-related-grid">${cards}</div></section>`;
}

export function renderFeaturedDomainSsr(detail: FeaturedDomainDetail): string {
  const domain = detail.domain;
  const keywords = domain.categories;
  const keywordMarkup = keywords.length
    ? `<div class="featured-detail-tags" aria-label="${escapeHtml(domain.domain)} categories">${keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>`
    : "";
  const descriptionMarkup = domain.description
    ? `<p class="featured-detail-description">${escapeHtml(domain.description)}</p>`
    : "";
  const formattedDate = domain.updated_at ? domain.updated_at.slice(0, 10) : "—";

  return `<div class="featured-detail-shell" data-featured-detail-ssr>
    <header class="featured-detail-header">
      <a class="brand" href="/" aria-label="${escapeHtml(detail.site.name)} home"><img src="${escapeHtml(detail.site.logo_url || "/unusedomain-logo.png")}" alt="" decoding="async" /><span>${escapeHtml(detail.site.name)}</span></a>
      <nav aria-label="Detail navigation"><a href="/">Home</a><a href="/domains">Catalog</a></nav>
      <a class="featured-detail-browse" href="/domains">Browse all domains</a>
    </header>
    <main class="featured-detail-main">
      <a class="featured-detail-back" href="/domains">← Back to catalog</a>
      <section class="featured-detail-hero">
        <span class="featured-detail-kicker">★ Featured</span>
        <h1>${escapeHtml(domain.domain)}</h1>
        ${keywordMarkup}
        ${descriptionMarkup}
        <dl class="featured-detail-meta">
          <div><dt>TLD</dt><dd>.${escapeHtml(domain.tld)}</dd></div>
          <div><dt>Characters</dt><dd>${domain.character_count}</dd></div>
          <div><dt>Type</dt><dd>${escapeHtml(domain.type)}</dd></div>
          <div><dt>Registrar</dt><dd>${escapeHtml(domain.registrar_name ?? "—")}</dd></div>
          <div><dt>Updated</dt><dd>${escapeHtml(formattedDate)}</dd></div>
        </dl>
        <a class="featured-detail-visit" href="https://${encodeURI(domain.domain)}" target="_blank" rel="noopener noreferrer nofollow">Visit this domain →</a>
      </section>
      <section class="featured-related" aria-labelledby="featured-related-title">
        <div class="featured-related-heading"><h2 id="featured-related-title">Similar domains</h2></div>
        ${detailRecommendationMarkup(`Same TLD .${domain.tld}`, detail.same_tld)}
        ${detailRecommendationMarkup(`Same length: ${domain.character_count} chars`, detail.same_length)}
      </section>
    </main>
    <footer class="featured-detail-footer"><span>${escapeHtml(detail.site.name)} · Featured domains</span><a href="/">unusedomain.com</a></footer>
  </div>`;
}
