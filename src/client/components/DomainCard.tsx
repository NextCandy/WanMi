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
  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!calendarDate) return null;
  return `${calendarDate[1]}.${calendarDate[2]}.${calendarDate[3]}`;
}

/** 到期剩余天数；无到期数据返回 null，已到期返回负数 */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!calendarDate) return null;
  const expires = Date.UTC(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]));
  const today = new Date();
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expires - current) / 86_400_000);
}

/** 注册至今的整年数；不足一年返回 0，无注册日期返回 null */
function ageInYears(value: string | null): number | null {
  if (!value) return null;
  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!calendarDate) return null;
  const registered = Date.UTC(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]));
  const years = (Date.now() - registered) / (365.2425 * 86_400_000);
  return years < 0 ? null : Math.floor(years);
}

const WARNING_DAYS = 30;
const URGENT_DAYS = 7;

function DomainCardComponent({ domain, onCopy, onQuickView }: DomainCardProps) {
  const tld = domain.domain.split(".").at(-1) || domain.tld;
  const registeredOn = formatDate(domain.registered_at);
  const expiresOn = formatDate(domain.expires_at);
  const remaining = daysUntil(domain.expires_at);
  const expired = remaining !== null && remaining < 0;
  const urgent = remaining !== null && remaining >= 0 && remaining <= URGENT_DAYS;
  const warning = remaining !== null && remaining > URGENT_DAYS && remaining <= WARNING_DAYS;
  const age = ageInYears(domain.registered_at);

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <div className="card-badge-row">
        <span className="tld-badge">.{tld}</span>
        {domain.is_featured ? <span className="featured-star" aria-label="Featured" title="Featured"><Star aria-hidden="true" /></span> : null}
        {age !== null ? <span className={`age-badge${age >= 10 ? " is-aged" : ""}`}>{age > 0 ? `Age ${age} ${age === 1 ? "Year" : "Years"}` : "New"}</span> : null}
        <div className="domain-actions">
          <button type="button" aria-label={`Copy ${domain.domain}`} title={`Copy ${domain.domain}`} onClick={() => onCopy(domain.domain)}><Copy aria-hidden="true" /></button>
          <button type="button" aria-label={`View ${domain.domain}`} title={`View ${domain.domain}`} onClick={() => onQuickView(domain)}><Eye aria-hidden="true" /></button>
        </div>
      </div>
      <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span className="domain-tld">.{domain.tld}</span></a></div>
      {domain.description ? <p className="domain-description">{domain.description}</p> : null}
      <div className="card-expiry-row">
        <span className={`registration-range${registeredOn && expiresOn ? "" : " date-unknown"}`}>
          {registeredOn && expiresOn ? `${registeredOn}-${expiresOn}` : "Date pending"}
        </span>
        <span className={`remaining-days${expired ? " is-expired" : urgent ? " is-urgent" : warning ? " is-warning" : remaining === null ? " expiry-unknown" : ""}`}>
          {remaining === null ? "Unknown" : expired ? `Expired ${Math.abs(remaining)} Days` : `${remaining} Days`}
        </span>
      </div>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
