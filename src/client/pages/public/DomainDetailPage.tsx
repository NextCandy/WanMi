import { FormEvent, useEffect, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { api } from "../../lib/api";
import { copyText } from "../../lib/clipboard";
import type { PublicDomain } from "../../../shared/types/api";

interface RdapSummary {
  domain: string;
  registrar: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  status: string[];
  nameservers: string[];
}

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
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState("");
  const [rdap, setRdap] = useState<RdapSummary | null>(null);
  const [rdapState, setRdapState] = useState<"idle" | "loading" | "error">("idle");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [offer, setOffer] = useState({ contact: "", amount: "", message: "" });
  const [offerState, setOfferState] = useState<"idle" | "submitting" | "done">("idle");

  const notify = (text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone });

  useEffect(() => {
    api<DetailResponse>(`/api/public/domains/${encodeURIComponent(name)}`)
      .then((response) => {
        setData(response);
        document.title = `${response.domain.domain} 域名出售`;
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "域名加载失败"));
  }, [name]);

  useEffect(() => {
    setRdapState("loading");
    api<RdapSummary>(`/api/public/rdap/${encodeURIComponent(name)}`)
      .then((summary) => {
        setRdap(summary);
        setRdapState("idle");
      })
      .catch(() => setRdapState("error"));
  }, [name]);

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
          amount: offer.amount.trim() || null,
          message: offer.message.trim() || null,
        }),
      });
      setOfferState("done");
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
          <span className="brand-mark">W</span>
          <span>WanMi</span>
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
              <button className="secondary-button" onClick={() => void copyDomain()} title={`复制 ${domain.domain}`}>⧉ 复制域名</button>
            </div>
            <div className="detail-badges">
              <span className="chip chip-brand">.{domain.tld}</span>
              <span className="chip">{domain.name.length} 位</span>
              {domain.is_featured && <span className="chip" style={{ background: "color-mix(in oklab, var(--premium) 18%, transparent)", borderColor: "color-mix(in oklab, var(--premium) 45%, transparent)", color: "var(--premium-fg)" }}>精品</span>}
              {domain.is_market_listed && <span className="badge-status badge-listed">Listed</span>}
              {domain.category && <span className="chip">{domain.category}</span>}
            </div>
            <div className="detail-grid">
              <div className="admin-stack">
                <section className="detail-panel">
                  <h2>Whois 摘要</h2>
                  {rdapState === "loading" && <div className="empty-inline">正在查询 RDAP…</div>}
                  {rdapState === "error" && <div className="empty-inline">RDAP 查询暂不可用，稍后再试。</div>}
                  {rdap && (
                    <div className="whois-list">
                      <div><span>注册商</span><b>{rdap.registrar ?? "—"}</b></div>
                      <div><span>注册时间</span><b>{formatDate(rdap.createdAt)}</b></div>
                      <div><span>到期时间</span><b>{formatDate(rdap.expiresAt)}</b></div>
                      <div><span>域名状态</span><b>{rdap.status.length ? rdap.status.slice(0, 3).join(", ") : "—"}</b></div>
                      <div><span>Nameserver</span><b>{rdap.nameservers.length ? rdap.nameservers.slice(0, 2).join(", ") : "—"}</b></div>
                    </div>
                  )}
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
                {domain.public_price ? (
                  <div className="detail-price"><strong>{domain.public_price}</strong><span>一口价</span></div>
                ) : (
                  <div className="detail-price"><strong>可议价</strong><span>提交报价获取回复</span></div>
                )}
                {offerState === "done" ? (
                  <div className="state-panel small-state" style={{ minHeight: 120 }}>
                    <strong>已收到你的求购</strong>
                    <span>我们会通过你留下的联系方式回复。</span>
                  </div>
                ) : (
                  <form className="offer-form" onSubmit={(event) => void submitOffer(event)}>
                    <label>联系方式（邮箱 / 微信 / Telegram）
                      <input value={offer.contact} onChange={(event) => setOffer({ ...offer, contact: event.target.value })} required maxLength={200} placeholder="how@to.reach.you" />
                    </label>
                    <label>报价（可选，数字）
                      <input value={offer.amount} onChange={(event) => setOffer({ ...offer, amount: event.target.value })} inputMode="decimal" pattern="\d+(\.\d+)?" placeholder="8888" />
                    </label>
                    <label>留言（可选）
                      <textarea value={offer.message} onChange={(event) => setOffer({ ...offer, message: event.target.value })} maxLength={1000} placeholder="想用它做什么？" />
                    </label>
                    <button className="primary-button" disabled={offerState === "submitting"}>
                      {offerState === "submitting" ? "正在提交…" : "提交求购 Make Offer"}
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
