import { useEffect, useMemo, useRef } from "react";

import type { PublicDomain } from "../../shared/types/api";
import { getSimilarDomains } from "../lib/domain-discovery";

interface DomainDetailDialogProps {
  domain: PublicDomain | null;
  candidates: PublicDomain[];
  favorite: boolean;
  onClose: () => void;
  onCopy: (domain: string) => void;
  onFavorite: (domain: PublicDomain) => void;
  onSelect: (domain: PublicDomain) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

export function DomainDetailDialog({ domain, candidates, favorite, onClose, onCopy, onFavorite, onSelect }: DomainDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const similar = useMemo(() => domain ? getSimilarDomains(domain, candidates) : [], [candidates, domain]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (domain && dialog && !dialog.open) dialog.showModal();
  }, [domain]);

  if (!domain) return null;
  const categories = domain.categories.length ? domain.categories : domain.category ? [domain.category] : [];

  return (
    <dialog ref={dialogRef} className="domain-detail-dialog" aria-labelledby="quick-domain-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section>
        <button type="button" className="modal-close" onClick={onClose} aria-label="关闭域名速览" autoFocus>×</button>
        <span className="detail-kicker">DOMAIN QUICK VIEW</span>
        <h2 id="quick-domain-title">{domain.name}<span>.{domain.tld}</span></h2>
        <div className="detail-badges">{domain.is_featured && <span className="chip chip-featured">精品域名</span>}{categories.map((category) => <span className="chip" key={category}>{category}</span>)}</div>
        <p className="detail-description">{domain.description || "这个域名暂未填写公开简介。"}</p>
        <dl className="quick-detail-grid">
          <div><dt>完整域名</dt><dd>{domain.domain}</dd></div>
          <div><dt>主体长度</dt><dd>{domain.name.length} 字符</dd></div>
          <div><dt>后缀</dt><dd>.{domain.tld}</dd></div>
          <div><dt>注册日期</dt><dd>{formatDate(domain.registered_at)}</dd></div>
          <div><dt>到期日期</dt><dd>{formatDate(domain.expires_at)}</dd></div>
        </dl>
        <div className="quick-detail-actions">
          <button type="button" className="secondary-button" onClick={() => onCopy(domain.domain)}>复制域名</button>
          <button type="button" className="secondary-button" aria-pressed={favorite} onClick={() => onFavorite(domain)}>{favorite ? "取消收藏" : "收藏域名"}</button>
          <a className="secondary-button" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer">访问域名 ↗</a>
        </div>
        {similar.length > 0 && <div className="quick-similar"><strong>相似域名</strong><div>{similar.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}>{item.domain}</button>)}</div></div>}
      </section>
    </dialog>
  );
}
