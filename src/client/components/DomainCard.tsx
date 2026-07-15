import type { PublicDomain } from "../../shared/types/api";

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>;
}

function HeartIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>;
}

function EyeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
}

interface DomainCardProps {
  domain: PublicDomain;
  favorite: boolean;
  highlighted: boolean;
  hasContact: boolean;
  onCopy: (domain: string) => void;
  onFavorite: (domain: PublicDomain) => void;
  onQuickView: (domain: PublicDomain) => void;
  onContact: () => void;
}

export function DomainCard({ domain, favorite, highlighted, hasContact, onCopy, onFavorite, onQuickView, onContact }: DomainCardProps) {
  const categories = domain.categories.length ? domain.categories : domain.category ? [domain.category] : [];
  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}${highlighted ? " highlighted" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <div className="domain-primary">
        <div className="domain-name"><a id={`domain-${domain.id}`} href={`/d/${encodeURIComponent(domain.domain)}`}><strong>{domain.name}</strong><span>.{domain.tld}</span></a></div>
        <div className="domain-tags">{domain.is_featured && <span className="chip chip-featured">精品</span>}{categories.slice(0, 3).map((category) => <span className="chip" key={category}>{category}</span>)}{categories.length > 3 && <span className="chip">+{categories.length - 3}</span>}</div>
      </div>
      <p className="domain-description">{domain.description || "暂无简介"}</p>
      <div className="domain-card-meta"><span>{domain.name.length} 字符</span><span>.{domain.tld}</span></div>
      <div className="domain-actions">
        <button type="button" className={`favorite-button${favorite ? " active" : ""}`} aria-label={favorite ? `取消收藏 ${domain.domain}` : `收藏 ${domain.domain}`} aria-pressed={favorite} title={favorite ? "取消收藏" : "收藏"} onClick={() => onFavorite(domain)}><HeartIcon /><span>{favorite ? "已收藏" : "收藏"}</span></button>
        <button type="button" title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><CopyIcon /><span>复制</span></button>
        <button type="button" aria-label={`速览 ${domain.domain}`} onClick={() => onQuickView(domain)}><EyeIcon /><span>速览</span></button>
        {hasContact && <button type="button" onClick={onContact}><MailIcon /><span>我想要</span></button>}
      </div>
    </article>
  );
}
