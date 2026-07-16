import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DomainCard } from "../../src/client/components/DomainCard";
import type { PublicDomain } from "../../src/shared/types/api";

const domain: PublicDomain = {
  id: 7,
  domain: "mx.ooo",
  name: "mx",
  tld: "ooo",
  description: "",
  keywords: ["短字符", "品牌"],
  category: "字母",
  categories: ["纯字母"],
  is_featured: true,
  registered_at: null,
  expires_at: null,
};

function renderCard(value: PublicDomain = domain): string {
  return renderToStaticMarkup(createElement(DomainCard, {
    domain: value,
    favorite: false,
    highlighted: false,
    onCopy: vi.fn(),
    onFavorite: vi.fn(),
    onQuickView: vi.fn(),
  }));
}

describe("DomainCard", () => {
  it("按域名、关键词、元数据与访问入口的层级渲染精品卡片", () => {
    const markup = renderCard();

    expect(markup).toContain('class="domain-card featured"');
    expect(markup).toContain('class="domain-featured-dot"');
    expect(markup).toContain('<strong>mx</strong><span>.ooo</span>');
    expect(markup).toContain('class="domain-divider"');
    expect(markup).toContain('class="domain-keywords"');
    expect(markup).toContain("短字符");
    expect(markup).toContain(".ooo");
    expect(markup).toContain("2字符");
    expect(markup).toContain("纯字母");
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="收藏 mx.ooo"');
    expect(markup).toContain('aria-label="复制 mx.ooo"');
    expect(markup).toContain('aria-label="速览 mx.ooo"');
    expect(markup).toContain('class="domain-visit"');
    expect(markup).toContain('aria-label="访问 mx.ooo"');
  });

  it("关键词为空时不渲染标签行", () => {
    const markup = renderCard({ ...domain, keywords: [], is_featured: false });

    expect(markup).not.toContain("domain-keywords");
    expect(markup).not.toContain("domain-featured-dot");
    expect(markup).toContain('aria-label="访问 mx.ooo"');
  });
});
