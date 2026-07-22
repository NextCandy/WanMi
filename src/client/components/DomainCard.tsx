import { memo } from "react";
import { Copy, Eye, Star } from "lucide-react";

import type { PublicDomain } from "../../shared/types/api";

interface DomainCardProps {
  domain: PublicDomain;
  onCopy: (domain: string) => void;
  onQuickView: (domain: PublicDomain) => void;
}

type HandNoteKind = "tld" | "description" | "registrar" | "remaining";

interface HandNoteProps {
  kind: HandNoteKind;
  label: string;
  value?: string | null;
}

const HAND_NOTE_PATHS: Record<HandNoteKind, { curve: string; head: string }> = {
  tld: {
    curve: "M58 8 C42 7 27 12 8 27",
    head: "M15 25 L8 27 L11 20",
  },
  description: {
    curve: "M58 8 C41 8 27 14 8 28",
    head: "M15 26 L8 28 L11 21",
  },
  registrar: {
    curve: "M6 7 C20 8 35 15 56 29",
    head: "M49 29 L56 29 L53 22",
  },
  remaining: {
    curve: "M6 7 C23 8 38 15 57 28",
    head: "M50 28 L57 28 L54 21",
  },
};

function HandNote({ kind, label, value }: HandNoteProps) {
  const path = HAND_NOTE_PATHS[kind];
  return (
    <span className={`hand-note hand-note-${kind}`}>
      <span className="hand-note-label">{label}</span>
      {value ? <span className="hand-note-value">{value}</span> : null}
      <svg viewBox="0 0 64 36" aria-hidden="true" focusable="false">
        <path pathLength="1" d={path.curve} />
        <path pathLength="1" d={path.head} />
      </svg>
    </span>
  );
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
  const category = domain.categories[0] ?? domain.category;
  const registrar = domain.registrar_name?.trim() || null;

  return (
    <article id={`domain-card-${domain.id}`} className={`domain-card${domain.is_featured ? " featured" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <div className="domain-annotation-layer" aria-hidden="true">
        <HandNote kind="tld" label="后缀" />
        <HandNote kind="description" label="简介" />
        {registrar ? <HandNote kind="registrar" label="注册商" value={registrar} /> : null}
        <HandNote kind="remaining" label="剩余时间" />
      </div>
      <div className="card-badge-row">
        <span className="tld-badge" data-annotation-target="tld">.{tld}</span>
        {category ? <span className="category-badge">{domain.is_featured ? <Star aria-hidden="true" /> : null}{category}</span> : null}
        <div className="domain-actions">
          <button type="button" aria-label={`复制 ${domain.domain}`} title={`复制 ${domain.domain}`} onClick={() => onCopy(domain.domain)}><Copy aria-hidden="true" /></button>
          <button type="button" aria-label={`查看 ${domain.domain}`} title={`查看 ${domain.domain}`} onClick={() => onQuickView(domain)}><Eye aria-hidden="true" /></button>
        </div>
      </div>
      <div className="domain-name"><a id={`domain-${domain.id}`} href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer nofollow"><strong>{domain.name}</strong><span className="domain-tld">.{domain.tld}</span></a></div>
      {domain.description ? <p className="domain-description" data-annotation-target="description">{domain.description}</p> : <p className="domain-description placeholder" data-annotation-target="description" aria-hidden="true" />}
      <div className="card-expiry-row">
        <span className={`registration-range${registeredOn && expiresOn ? "" : " date-unknown"}`}>
          {registeredOn && expiresOn ? `${registeredOn}-${expiresOn}` : "日期待补充"}
        </span>
        <span data-annotation-target="remaining" className={`remaining-days${expired ? " is-expired" : urgent ? " is-urgent" : warning ? " is-warning" : remaining === null ? " expiry-unknown" : ""}`}>
          {remaining === null ? "有效期未知" : expired ? `已过期${Math.abs(remaining)}天` : `余${remaining}天`}
        </span>
      </div>
    </article>
  );
}

export const DomainCard = memo(DomainCardComponent);
