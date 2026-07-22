import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicDomain } from "../../shared/types/api";
import { getSimilarDomainGroups } from "../lib/domain-discovery";
import { categoryLabel } from "../lib/category-label";
import { getDomainCharacterProfile, getPinyinMeaning, getTldHeat, getTldRegistryUrl } from "../lib/domain-insights";

interface DomainDetailDialogProps {
  domain: PublicDomain | null;
  candidates: PublicDomain[];
  onClose: () => void;
  onCopy: (domain: string) => void;
  onSelect: (domain: PublicDomain) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
}

export function DomainDetailDialog({ domain, candidates, onClose, onCopy, onSelect }: DomainDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [qrCode, setQrCode] = useState<{ domain: string; dataUrl: string } | null>(null);
  const similar = useMemo(() => domain ? getSimilarDomainGroups(domain, candidates) : { sameTld: [], sameLength: [] }, [candidates, domain]);
  const domainValue = domain?.domain ?? "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (domain && dialog && !dialog.open) dialog.showModal();
  }, [domain]);

  useEffect(() => {
    if (!domainValue) return;
    let active = true;
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(`https://${domainValue}`, {
      width: 128,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#161512", light: "#ffffff" },
    })).then((dataUrl) => {
      if (active) setQrCode({ domain: domainValue, dataUrl });
    }).catch(() => {
      if (active) setQrCode(null);
    });
    return () => { active = false; };
  }, [domainValue]);

  if (!domain) return null;
  const categories = domain.categories.length ? domain.categories : domain.category ? [domain.category] : [];
  const characterProfile = getDomainCharacterProfile(domain.name);
  const pinyinMeaning = getPinyinMeaning(domain.name);
  const currentQrCode = qrCode?.domain === domain.domain ? qrCode.dataUrl : null;
  const hasSimilar = similar.sameTld.length > 0 || similar.sameLength.length > 0;

  return (
    <dialog ref={dialogRef} className="domain-detail-dialog" aria-labelledby="quick-domain-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close quick view" autoFocus>×</button>
        <h2 id="quick-domain-title">{domain.name}<span>.{domain.tld}</span></h2>
        <div className="detail-badges">{domain.is_featured && <span className="chip chip-featured">Featured</span>}{categories.map((category) => <span className="chip" key={category}>{categoryLabel(category)}</span>)}</div>
        {domain.description && <p className="detail-description">{domain.description}</p>}
        <dl className="quick-detail-grid">
          <div><dt>Domain</dt><dd>{domain.domain}</dd></div>
          <div><dt>Length</dt><dd>{domain.name.length} chars</dd></div>
          <div><dt>TLD</dt><dd>.{domain.tld}</dd></div>
          <div><dt>Registered</dt><dd>{formatDate(domain.registered_at)}</dd></div>
          <div><dt>Expires</dt><dd>{formatDate(domain.expires_at)}</dd></div>
        </dl>
        <section className="quick-value-section" aria-labelledby="quick-value-title">
          <h3 id="quick-value-title">Domain profile</h3>
          <div className="quick-value-grid">
            <article><span>Characters</span><strong>{characterProfile.count}</strong><small>in name</small></article>
            <article><span>Composition</span><strong>{characterProfile.composition}</strong><small>{characterProfile.hasRepeatedCharacter ? "Has repeats" : "No repeats"}</small></article>
            <article><span>TLD heat</span><strong>{getTldHeat(domain.tld)}</strong><small>.{domain.tld}</small></article>
            <article className="quick-value-pinyin"><span>Pinyin</span><strong>{pinyinMeaning ?? "No clear reading"}</strong><small>{pinyinMeaning ? "Common Chinese reading" : "No common match"}</small></article>
          </div>
        </section>
        <div className="quick-resource-grid">
          <section className="quick-qr-section" aria-labelledby="quick-qr-title">
            <div className="quick-section-heading">
              <div><h3 id="quick-qr-title">QR code</h3><p>https://{domain.domain}</p></div>
              {currentQrCode && <a className="quick-qr-download" href={currentQrCode} download={`${domain.domain}-qrcode.png`}>Download PNG</a>}
            </div>
            <div className="quick-qr-frame" aria-live="polite">
              {currentQrCode
                ? <img src={currentQrCode} width="128" height="128" alt={`QR code for ${domain.domain}`} />
                : <span>Generating QR code…</span>}
            </div>
          </section>
          <section className="quick-external-section" aria-labelledby="quick-external-title">
            <div className="quick-section-heading"><div><h3 id="quick-external-title">External lookup</h3><p>Verify public records with trusted sources</p></div></div>
            <div className="quick-external-links">
              <a href={`https://whois.com/whois/${encodeURIComponent(domain.domain)}`} target="_blank" rel="noopener noreferrer"><span>WHOIS</span><b>↗</b></a>
              <a href={`https://web.archive.org/web/*/${encodeURIComponent(domain.domain)}`} target="_blank" rel="noopener noreferrer"><span>Web archive</span><b>↗</b></a>
              <a href={getTldRegistryUrl(domain.tld)} target="_blank" rel="noopener noreferrer"><span>TLD registry</span><b>↗</b></a>
            </div>
          </section>
        </div>
        <div className="quick-detail-actions">
          <button type="button" className="secondary-button" onClick={() => onCopy(domain.domain)}>Copy domain</button>
          <a className="secondary-button" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer">Visit domain ↗</a>
          {domain.is_featured && <a className="detail-page-link" href={`/d/${encodeURIComponent(domain.domain)}`}>View details →</a>}
        </div>
        {hasSimilar && <section className="quick-similar" aria-labelledby="quick-similar-title">
          <h3 id="quick-similar-title">Similar domains</h3>
          {similar.sameTld.length > 0 && <div className="quick-similar-group">
            <strong>Same TLD</strong>
            <div className="quick-similar-scroll">{similar.sameTld.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}><span>{item.domain}</span><small>.{item.tld}</small></button>)}</div>
          </div>}
          {similar.sameLength.length > 0 && <div className="quick-similar-group">
            <strong>Same length</strong>
            <div className="quick-similar-scroll">{similar.sameLength.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}><span>{item.domain}</span><small>{item.name.length} chars</small></button>)}</div>
          </div>}
        </section>}
      </section>
    </dialog>
  );
}
