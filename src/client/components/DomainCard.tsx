import { memo } from "react";

import type { PublicDomain } from "../../shared/types/api";

const CATEGORY_LABELS: Record<string, string> = {
  字母: "纯字母",
  数字: "纯数字",
  英文: "英文词语",
};

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
}

function EyeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

interface DomainCardProps {
  domain: PublicDomain;
  highlighted: boolean;
  onCopy: (domain: string) => void;
  onQuickView: (domain: PublicDomain) => void;
}

function DomainCardComponent({ domain, highlighted, onCopy, onQuickView }: DomainCardProps) {
  const domainParts = domain.domain.split(".");
  const tld = domainParts.at(-1) || domain.tld;
  const characterCount = domainParts[0]?.length ?? domain.name.length;
  const category = domain.category
    ? (CATEGORY_LABELS[domain.category] ?? domain.category)
    : (domain.categories[0] || "其他");

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}${highlighted ? " highlighted" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      {domain.is_featured ? <span className="domain-featured-dot" aria-hidden="true" /> : null}
      <div className="domain-primary">
        <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span>.{domain.tld}</span></a></div>
      </div>
      <div className="domain-actions">
        <button type="button" aria-label={`复制 ${domain.domain}`} title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><CopyIcon /></button>
        <button type="button" aria-label={`速览 ${domain.domain}`} title={`速览 ${domain.domain}`} onClick={() => onQuickView(domain)}><EyeIcon /></button>
      </div>
      <span className="domain-divider" aria-hidden="true" />
      {domain.description && <p className="domain-description">{domain.description}</p>}
      <div className="domain-card-meta" aria-label={`${domain.domain} 元数据`}><span>.{tld}</span><span>{characterCount}字符</span><span>{category}</span></div>
      <a className="domain-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow" aria-label={`访问 ${domain.domain}`} title={`访问 ${domain.domain}`}><span>访问</span><ArrowIcon /></a>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
