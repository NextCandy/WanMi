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
    highlighted: false,
    onCopy: vi.fn(),
    onQuickView: vi.fn(),
  }));
}

describe("DomainCard", () => {
  it("按域名、简介、元数据与访问入口的层级渲染精品卡片", () => {
    const markup = renderCard();

    expect(markup).toContain('class="domain-card featured"');
    expect(markup).toContain('class="domain-featured-dot"');
    expect(markup).toContain('<strong>mx</strong><span>.ooo</span>');
    expect(markup).toContain('class="domain-divider"');
    expect(markup).toContain(".ooo");
    expect(markup).toContain("2字符");
    expect(markup).toContain("纯字母");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="复制 mx.ooo"');
    expect(markup).toContain('aria-label="速览 mx.ooo"');
    expect(markup).toContain('class="domain-visit"');
    expect(markup).toContain('aria-label="访问 mx.ooo"');
  });

  it("普通域名不渲染精品标记", () => {
    const markup = renderCard({ ...domain, is_featured: false });

    expect(markup).not.toContain("domain-featured-dot");
    expect(markup).toContain('aria-label="访问 mx.ooo"');
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
