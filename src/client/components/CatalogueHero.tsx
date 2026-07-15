import { useEffect, useMemo, useState } from "react";

interface CatalogueHeroProps {
  title: string;
  description: string;
  bio: string | null;
  total: number;
  tldCount: number;
  featuredCount: number;
  latestAddedAt: string | null;
  categoryCounts: Record<string, number>;
}

function useAnimatedCount(value: number): number {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) {
      setDisplay(value);
      return;
    }
    const startedAt = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

export function CatalogueHero({ title, description, bio, total, tldCount, featuredCount, latestAddedAt, categoryCounts }: CatalogueHeroProps) {
  const animatedTotal = useAnimatedCount(total);
  const composition = useMemo(() => {
    const entries = Object.entries(categoryCounts).sort((left, right) => right[1] - left[1]).slice(0, 6);
    const sum = entries.reduce((count, [, value]) => count + value, 0);
    return entries.map(([name, count]) => ({ name, count, percent: sum ? (count / sum) * 100 : 0 }));
  }, [categoryCounts]);
  const latest = latestAddedAt ? new Date(latestAddedAt) : null;
  const latestLabel = latest && !Number.isNaN(latest.getTime()) ? latest.toLocaleDateString("zh-CN") : "持续更新";

  return (
    <section className="catalogue-hero" aria-labelledby="catalogue-title">
      <div className="hero-copy">
        <span className="hero-eyebrow">WANMI DOMAIN COLLECTION</span>
        <h1 id="catalogue-title">{title}</h1>
        <p>{bio || description}</p>
      </div>
      <dl className="hero-stats" aria-label="域名资产概览">
        <div className="hero-value"><dt>公开资产</dt><dd><strong>{animatedTotal.toLocaleString("zh-CN")}</strong><span>个域名</span></dd></div>
        <div><dt>后缀覆盖</dt><dd><strong>{tldCount}</strong><span>种后缀</span></dd></div>
        <div><dt>精品收藏</dt><dd><strong>{featuredCount}</strong><span>个精品</span></dd></div>
        <div><dt>最近更新</dt><dd><b>{latestLabel}</b></dd></div>
      </dl>
      {composition.length > 0 && <div className="hero-composition" aria-label="主要分类构成">
        <div className="hero-bar">{composition.map((item) => <i key={item.name} style={{ width: `${item.percent}%` }} title={`${item.name}：${item.count}`} />)}</div>
        <div className="hero-legend">{composition.map((item) => <span key={item.name}><i />{item.name}<b>{item.count}</b></span>)}</div>
      </div>}
    </section>
  );
}
