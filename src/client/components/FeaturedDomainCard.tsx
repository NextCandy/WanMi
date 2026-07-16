import { memo } from "react";

import type { PublicDomain } from "../../shared/types/api";

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

interface FeaturedDomainCardProps {
  domain: PublicDomain;
}

function FeaturedDomainCardComponent({ domain }: FeaturedDomainCardProps) {
  const labels = domain.keywords.length > 0
    ? domain.keywords.slice(0, 3)
    : (domain.categories.length > 0 ? domain.categories : domain.category ? [domain.category] : []).slice(0, 3);

  return (
    <article className="featured-domain-card" aria-labelledby={`featured-domain-${domain.id}`}>
      <div className="featured-domain-card-copy">
        <h3 id={`featured-domain-${domain.id}`}>{domain.name}<span>.{domain.tld}</span></h3>
        {labels.length > 0 ? <div className="featured-domain-tags" aria-label={`${domain.domain} 关键词`}>
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div> : null}
      </div>
      <div className="featured-domain-card-footer">
        <div className="featured-domain-meta" aria-label={`${domain.domain} 元数据`}>
          <span>.{domain.tld}</span>
          <span>{domain.name.length} 字符</span>
        </div>
        <a className="featured-domain-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow" aria-label={`访问 ${domain.domain}`}>
          访问 <ArrowIcon />
        </a>
      </div>
    </article>
  );
}

export const FeaturedDomainCard = memo(FeaturedDomainCardComponent);
