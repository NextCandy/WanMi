import { useEffect, useState } from "react";

interface CatalogueHeroProps {
  totalDomains: number;
  totalTlds: number;
  totalFeatured: number;
}

const QUICK_LINKS = [
  { label: "全部", href: "/domains" },
  { label: "纯字母", href: "/domains?category=%E7%BA%AF%E5%AD%97%E6%AF%8D" },
  { label: "纯数字", href: "/domains?category=%E7%BA%AF%E6%95%B0%E5%AD%97" },
  { label: "拼音", href: "/domains?category=%E6%8B%BC%E9%9F%B3" },
  { label: "精品", href: "/domains?category=%E7%B2%BE%E5%93%81" },
] as const;

function useAnimatedCount(value: number): number {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) {
      setDisplay(value);
      return;
    }
    const startedAt = performance.now();
    const duration = 800;
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

export function CatalogueHero({ totalDomains, totalTlds, totalFeatured }: CatalogueHeroProps) {
  const animatedDomains = useAnimatedCount(totalDomains);
  const animatedTlds = useAnimatedCount(totalTlds);
  const animatedFeatured = useAnimatedCount(totalFeatured);

  return (
    <section className="catalogue-hero" aria-labelledby="catalogue-title">
      <div className="hero-copy">
        <span className="hero-subtitle">WANMI DOMAIN VAULT</span>
        <h1 id="catalogue-title">玩米 · 精选域名资产</h1>
        <p>精选短字符域名资产，安全托管与展示</p>
      </div>
      <dl className="hero-stats" aria-label="域名资产概览">
        <div><dd><strong>{animatedDomains.toLocaleString("zh-CN")}</strong><span>个域名</span></dd><dt>公开资产</dt></div>
        <div><dd><strong>{animatedTlds.toLocaleString("zh-CN")}</strong><span>种后缀</span></dd><dt>后缀覆盖</dt></div>
        <div><dd><strong>{animatedFeatured.toLocaleString("zh-CN")}</strong><span>件精品</span></dd><dt>精选收藏</dt></div>
      </dl>
      <nav className="hero-quick-links" aria-label="快速分类入口">
        {QUICK_LINKS.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
      </nav>
    </section>
  );
}
