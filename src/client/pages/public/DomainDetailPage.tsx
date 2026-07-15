import { FormEvent, useEffect, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { TurnstileWidget } from "../../components/TurnstileWidget";
import { useDomainFavorites } from "../../hooks/useDomainFavorites";
import { api } from "../../lib/api";
import { copyText } from "../../lib/clipboard";
import { useTracker } from "../../hooks/useTracker";
import type { PublicDomain } from "../../../shared/types/api";

interface DetailResponse {
  domain: PublicDomain;
  related: PublicDomain[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

export function DomainDetailPage({ name }: { name: string }) {
  const { trackDomainClick, trackLeadSubmit } = useTracker(`/d/${name}`);
  const favorites = useDomainFavorites();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [offer, setOffer] = useState({ contact: "", message: "" });
  const [offerState, setOfferState] = useState<"idle" | "submitting" | "done">("idle");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  const notify = (text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone });

  useEffect(() => {
    api<{ turnstile_site_key: string | null }>("/api/public/settings").then((settings) => setTurnstileSiteKey(settings.turnstile_site_key)).catch(() => undefined);
    api<DetailResponse>(`/api/public/domains/${encodeURIComponent(name)}`)
      .then((response) => {
        setData(response);
        favorites.sync([response.domain, ...response.related]);
        document.title = `${response.domain.domain} 域名详情`;
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "域名加载失败"));
  }, [favorites.sync, name]);

  async function copyDomain() {
    const ok = data && (await copyText(data.domain.domain));
    if (ok) notify(`已复制 ${data.domain.domain}`);
    else notify("复制失败，请手动复制", "error");
  }

  async function submitOffer(event: FormEvent) {
    event.preventDefault();
    if (!offer.contact.trim()) return;
    setOfferState("submitting");
    try {
      await api("/api/public/offers", {
        method: "POST",
        body: JSON.stringify({
          domain: name,
          contact: offer.contact.trim(),
          message: offer.message.trim() || null,
          turnstile_token: turnstileToken || null,
        }),
      });
      setOfferState("done");
      trackLeadSubmit(name);
      notify("求购信息已发送，我们会尽快联系你");
    } catch (reason) {
      setOfferState("idle");
      notify(reason instanceof Error ? reason.message : "提交失败", "error");
    }
  }

  if (error) {
    return (
      <div className="public-shell">
        <main className="detail-main">
          <a className="detail-back" href="/">← 返回域名列表</a>
          <div className="state-panel" style={{ marginTop: 24 }}>
            <strong>{error}</strong>
            <span>这个域名可能已下架或不存在。</span>
          </div>
        </main>
      </div>
    );
  }

  const domain = data?.domain;
  return (
    <div className="public-shell">
      <header className="public-header">
        <a className="brand" href="/" aria-label="返回首页">
          <span className="brand-mark">玩</span>
          <span>玩米</span>
        </a>
        <nav>
          <a href="/">全部域名</a>
          <ThemeToggle />
        </nav>
      </header>
      <main className="detail-main">
        <a className="detail-back" href="/">← 返回域名列表</a>
        {!domain ? (
          <div className="state-panel" style={{ marginTop: 24 }}>正在加载域名信息…</div>
        ) : (
          <>
            <div className="detail-head">
              <h1>{domain.name}<span>.{domain.tld}</span></h1>
              <div className="detail-head-actions"><button className="secondary-button" onClick={() => void copyDomain()} title={`复制 ${domain.domain}`}>⧉ 复制域名</button><button className="secondary-button" aria-pressed={favorites.ids.has(domain.id)} onClick={() => { const adding = !favorites.ids.has(domain.id); favorites.toggle(domain); notify(adding ? `已收藏 ${domain.domain}` : `已取消收藏 ${domain.domain}`); }}>{favorites.ids.has(domain.id) ? "♥ 已收藏" : "♡ 收藏"}</button><a className="primary-button" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" onMouseDown={() => trackDomainClick(domain.domain)}>访问域名 ↗</a></div>
            </div>
            <div className="detail-badges">
              <span className="chip chip-brand">.{domain.tld}</span>
              <span className="chip">{domain.name.length} 位</span>
              {domain.is_featured && <span className="chip" style={{ background: "color-mix(in oklab, var(--premium) 18%, transparent)", borderColor: "color-mix(in oklab, var(--premium) 45%, transparent)", color: "var(--premium-fg)" }}>精品</span>}
              {(domain.categories.length ? domain.categories : domain.category ? [domain.category] : []).map((category) => <span className="chip" key={category}>{category}</span>)}
            </div>
            {domain.description && <p className="detail-description">{domain.description}</p>}
            <div className="detail-grid">
              <div className="admin-stack">
                <section className="detail-panel">
                  <h2>域名日期</h2>
                  <p className="panel-note">来自已导入的域名资料，不进行外部联网查询。</p>
                  <div className="whois-list">
                    <div><span>注册日期</span><b>{formatDate(domain.registered_at)}</b></div>
                    <div><span>到期日期</span><b>{formatDate(domain.expires_at)}</b></div>
                  </div>
                </section>
                {data.related.length > 0 && (
                  <section className="detail-panel">
                    <h2>相关域名</h2>
                    <div className="related-grid">
                      {data.related.map((item) => (
                        <a key={item.id} href={`/d/${encodeURIComponent(item.domain)}`}>{item.name}<span>.{item.tld}</span></a>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <aside className="detail-panel">
                <h2>提交求购意向</h2>
                {offerState === "done" ? (
                  <div className="state-panel small-state" style={{ minHeight: 120 }}>
                    <strong>已收到你的求购</strong>
                    <span>我们会通过你留下的联系方式回复。</span>
                  </div>
                ) : (
                  <form className="offer-form" onSubmit={(event) => void submitOffer(event)}>
                    <label>联系方式（邮箱 / 微信 / Telegram）
                      <input value={offer.contact} onChange={(event) => setOffer((current) => ({ ...current, contact: event.target.value }))} required maxLength={200} placeholder="how@to.reach.you" />
                    </label>
                    <label>留言（可选）
                      <textarea value={offer.message} onChange={(event) => setOffer((current) => ({ ...current, message: event.target.value }))} maxLength={1000} placeholder="想用它做什么？" />
                    </label>
                    {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />}
                    <button className="primary-button" disabled={offerState === "submitting"}>
                      {offerState === "submitting" ? "正在提交…" : "提交求购意向"}
                    </button>
                  </form>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
