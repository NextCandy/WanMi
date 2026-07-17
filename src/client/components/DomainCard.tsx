import { memo } from "react";
import { ArrowRight, CalendarClock, CalendarPlus, Copy, Eye, Globe, Hourglass, Star } from "lucide-react";

import type { PublicDomain } from "../../shared/types/api";

interface DomainCardProps {
  domain: PublicDomain;
  onCopy: (domain: string) => void;
  onQuickView: (domain: PublicDomain) => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 到期剩余天数；无到期数据返回 null，已到期返回负数 */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const expires = new Date(value).getTime();
  if (Number.isNaN(expires)) return null;
  return Math.ceil((expires - Date.now()) / 86_400_000);
}

function DomainCardComponent({ domain, onCopy, onQuickView }: DomainCardProps) {
  const tld = domain.domain.split(".").at(-1) || domain.tld;
  const registered = formatDate(domain.registered_at);
  const expires = formatDate(domain.expires_at);
  const remaining = daysUntil(domain.expires_at);

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      {domain.is_featured ? <span className="domain-featured-badge" aria-label="精品域名"><Star aria-hidden="true" /> 精选</span> : null}
      <div className="domain-primary">
        <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span className="domain-tld">.{domain.tld}</span></a></div>
      </div>
      {domain.description ? <p className="domain-description">{domain.description}</p> : <p className="domain-description placeholder">暂无简介</p>}
      <div className="domain-card-meta" aria-label={`${domain.domain} 元数据`}>
        <span className="meta-chip"><Globe aria-hidden="true" />.{tld}</span>
        {registered && <span className="meta-chip"><CalendarPlus aria-hidden="true" />注册 {registered}</span>}
        {expires && <span className="meta-chip"><CalendarClock aria-hidden="true" />到期 {expires}</span>}
        {remaining !== null && <span className={`meta-chip${remaining <= 90 ? " meta-chip-warning" : ""}`}><Hourglass aria-hidden="true" />{remaining >= 0 ? `剩 ${remaining} 天` : "已到期"}</span>}
      </div>
      <div className="domain-card-footer">
        <a className="domain-visit" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow" aria-label={`访问 ${domain.domain}`} title={`访问 ${domain.domain}`}><span>访问域名</span><ArrowRight aria-hidden="true" /></a>
        <div className="domain-actions">
          <button type="button" aria-label={`复制 ${domain.domain}`} title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><Copy aria-hidden="true" /></button>
          <button type="button" aria-label={`速览 ${domain.domain}`} title={`速览 ${domain.domain}`} onClick={() => onQuickView(domain)}><Eye aria-hidden="true" /></button>
        </div>
      </div>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
