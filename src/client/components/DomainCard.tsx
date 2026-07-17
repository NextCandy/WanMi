import { memo } from "react";
import { ArrowRight, Copy, Eye, Globe, Ruler, Star, Tag } from "lucide-react";

import type { PublicDomain } from "../../shared/types/api";

const CATEGORY_LABELS: Record<string, string> = {
  字母: "纯字母",
  数字: "纯数字",
  英文: "英文词语",
};

interface DomainCardProps {
  domain: PublicDomain;
  onCopy: (domain: string) => void;
  onQuickView: (domain: PublicDomain) => void;
}

function DomainCardComponent({ domain, onCopy, onQuickView }: DomainCardProps) {
  const domainParts = domain.domain.split(".");
  const tld = domainParts.at(-1) || domain.tld;
  const characterCount = domainParts[0]?.length ?? domain.name.length;
  const category = domain.category
    ? (CATEGORY_LABELS[domain.category] ?? domain.category)
    : (domain.categories[0] || "其他");

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      {domain.is_featured ? <span className="domain-featured-badge" aria-label="精品域名"><Star aria-hidden="true" /> 精选</span> : null}
      <div className="domain-primary">
        <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span className="domain-tld">.{domain.tld}</span></a></div>
      </div>
      <div className="domain-actions">
        <button type="button" aria-label={`复制 ${domain.domain}`} title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><Copy aria-hidden="true" /></button>
        <button type="button" aria-label={`速览 ${domain.domain}`} title={`速览 ${domain.domain}`} onClick={() => onQuickView(domain)}><Eye aria-hidden="true" /></button>
      </div>
      {domain.description ? <p className="domain-description">{domain.description}</p> : <p className="domain-description placeholder">暂无简介</p>}
      <div className="domain-card-meta" aria-label={`${domain.domain} 元数据`}>
        <span className="meta-chip"><Globe aria-hidden="true" />.{tld}</span>
        <span className="meta-chip"><Ruler aria-hidden="true" />{characterCount} 字符</span>
        <span className="meta-chip"><Tag aria-hidden="true" />{category}</span>
      </div>
      <a className="domain-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow" aria-label={`访问 ${domain.domain}`} title={`访问 ${domain.domain}`}><span>访问域名</span><ArrowRight aria-hidden="true" /></a>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
