import { memo } from "react";
import { Copy, Eye, Star } from "lucide-react";

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

/** 紧急阈值：30 天内到期即标红提示，与前台「状态 · 30 天」筛选口径一致 */
const URGENT_DAYS = 30;

function DomainCardComponent({ domain, onCopy, onQuickView }: DomainCardProps) {
  const tld = domain.domain.split(".").at(-1) || domain.tld;
  const expiresOn = formatDate(domain.expires_at);
  const remaining = daysUntil(domain.expires_at);
  const expired = remaining !== null && remaining < 0;
  const urgent = remaining !== null && remaining >= 0 && remaining <= URGENT_DAYS;
  const category = domain.categories[0] ?? domain.category;

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <div className="card-badge-row">
        <span className="tld-badge">.{tld}</span>
        {category ? <span className="category-badge">{domain.is_featured ? <Star aria-hidden="true" /> : null}{category}{domain.is_featured ? " · 精品" : ""}</span> : null}
        <div className="domain-actions">
          <button type="button" aria-label={`复制 ${domain.domain}`} title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><Copy aria-hidden="true" /></button>
          <button type="button" aria-label={`速览 ${domain.domain}`} title={`速览 ${domain.domain}`} onClick={() => onQuickView(domain)}><Eye aria-hidden="true" /></button>
        </div>
      </div>
      <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span className="domain-tld">.{domain.tld}</span></a></div>
      {domain.description ? <p className="domain-description">{domain.description}</p> : <p className="domain-description placeholder" aria-hidden="true" />}
      <div className="card-expiry-row">
        {domain.is_featured
          ? <span className="domain-featured-badge" aria-label="精品域名"><Star aria-hidden="true" /></span>
          : <span className="expiry-spacer" aria-hidden="true" />}
        {expiresOn
          ? <span className={`expiry-text${expired ? " is-expired" : urgent ? " is-urgent" : ""}`}>
              {expiresOn} 到期{expired ? <em>（已过期）</em> : urgent ? <em>（紧急）</em> : null}
            </span>
          : <span className="expiry-text expiry-unknown">长期持有</span>}
      </div>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
