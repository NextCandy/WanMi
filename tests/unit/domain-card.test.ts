import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DomainCard } from "../../src/client/components/DomainCard";
import { DomainDetailDialog } from "../../src/client/components/DomainDetailDialog";
import type { PublicDomain } from "../../src/shared/types/api";

const domain: PublicDomain = {
  id: 7,
  domain: "mx.ooo",
  name: "mx",
  tld: "ooo",
  description: "",
  category: "字母",
  categories: ["纯字母"],
  is_featured: true,
  registered_at: null,
  expires_at: null,
};

function renderCard(value: PublicDomain = domain): string {
  return renderToStaticMarkup(createElement(DomainCard, {
    domain: value,
    onCopy: vi.fn(),
    onQuickView: vi.fn(),
  }));
}

describe("DomainCard", () => {
  it("按域名、简介、元数据与访问入口的层级渲染精品卡片", () => {
    const markup = renderCard();

    expect(markup).toContain('class="domain-card featured"');
    expect(markup).toContain('class="domain-featured-badge"');
    expect(markup).toContain("精选");
    expect(markup).toContain('<strong>mx</strong>');
    expect(markup).toContain('class="domain-tld">.ooo</span>');
    expect(markup).toContain('class="domain-description placeholder"');
    expect(markup).toContain('class="meta-chip"');
    expect(markup).toContain(".ooo");
    // 元数据：后缀 + 剩余天数 + 日期区间小框；无日期数据时后两者不渲染
    expect(markup).not.toContain("字符");
    expect(markup).not.toContain("纯字母");
    expect(markup).not.toContain("meta-lifespan");
    expect(markup).not.toContain("meta-remaining");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="复制 mx.ooo"');
    expect(markup).toContain('aria-label="速览 mx.ooo"');
    expect(markup).toContain('class="domain-visit"');
    expect(markup).toContain("访问域名");
    expect(markup).toContain('aria-label="访问 mx.ooo"');
  });

  it("普通域名不渲染精品标记", () => {
    const markup = renderCard({ ...domain, is_featured: false });

    expect(markup).not.toContain("domain-featured-badge");
    expect(markup).toContain('aria-label="访问 mx.ooo"');
  });

  it("有简介时显示简介文案", () => {
    const markup = renderCard({ ...domain, description: "这是一个简短的品牌介绍" });

    expect(markup).toContain("这是一个简短的品牌介绍");
    expect(markup).not.toContain("placeholder");
  });

  it("有生命周期数据时渲染剩余天数与日期区间，临近到期加警示", () => {
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const markup = renderCard({ ...domain, registered_at: "2015-05-12T00:00:00.000Z", expires_at: soon });

    // 区间为点分日期、无「注册/到期」标签
    expect(markup).toContain(`>2015.05.12-${soon.slice(0, 10).replaceAll("-", ".")}<`);
    expect(markup).not.toContain("注册 ");
    expect(markup).not.toContain("到期 ");
    expect(markup).toMatch(/剩 (29|30) 天/);
    expect(markup).toContain("meta-chip-warning");
  });

  it("仅有到期日期时区间框只显示到期日", () => {
    const markup = renderCard({ ...domain, expires_at: "2027-01-07T00:00:00.000Z" });
    expect(markup).toContain(">2027.01.07<");
  });
});

describe("DomainDetailDialog", () => {
  function renderDialog(value: PublicDomain): string {
    const candidates: PublicDomain[] = [
      value,
      { ...domain, id: 8, domain: "aa.ooo", name: "aa", is_featured: false },
      { ...domain, id: 9, domain: "yu.com", name: "yu", tld: "com", is_featured: false },
    ];
    return renderToStaticMarkup(createElement(DomainDetailDialog, {
      domain: value,
      candidates,
      onClose: vi.fn(),
      onCopy: vi.fn(),
      onSelect: vi.fn(),
    }));
  }

  it("精品域名速览显示独立详情页入口", () => {
    const markup = renderDialog(domain);
    expect(markup).toContain('class="detail-page-link"');
    expect(markup).toContain('href="/d/mx.ooo"');
    expect(markup).toContain("查看详情页 →");
  });

  it("普通域名速览不显示独立详情页入口", () => {
    const markup = renderDialog({ ...domain, is_featured: false });
    expect(markup).not.toContain("detail-page-link");
    expect(markup).not.toContain("查看详情页");
  });

  it("显示价值维度、外部查询与分组后的相似域名", () => {
    const markup = renderDialog(domain);

    expect(markup).toContain("域名价值维度");
    expect(markup).toContain("字符构成");
    expect(markup).toContain("纯字母");
    expect(markup).toContain("特色");
    expect(markup).toContain("WHOIS 查询");
    expect(markup).toContain('href="https://whois.com/whois/mx.ooo" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('href="https://web.archive.org/web/*/mx.ooo" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('href="https://www.infibeam.com/" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain("同后缀");
    expect(markup).toContain("同长度");
    expect(markup).not.toMatch(/购买|注册引导/);
  });
});
