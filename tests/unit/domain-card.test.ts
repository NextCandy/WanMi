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

function dottedDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}

describe("DomainCard", () => {
  it("按徽章行、衬线域名与到期行的层级渲染精品卡片", () => {
    const markup = renderCard();

    expect(markup).toContain('class="domain-card featured"');
    // 徽章行只剩后缀 + 精品星标 + 域龄；分类徽章已从卡片移除
    expect(markup).toContain('class="tld-badge">.ooo</span>');
    expect(markup).not.toContain("category-badge");
    expect(markup).toContain('class="featured-star"');
    expect(markup).toContain('<strong>mx</strong>');
    expect(markup).toContain('class="domain-tld">.ooo</span>');
    // 简介为空时整段不渲染：卡片靠这一条收到约 150px 高
    expect(markup).not.toContain("domain-description");
    // 前台文案统一英文
    expect(markup).not.toContain('class="domain-featured-badge"');
    expect(markup).toContain("Date pending");
    expect(markup).toContain("Unknown");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Copy mx.ooo"');
    expect(markup).toContain('aria-label="View mx.ooo"');
    // 访问入口是域名本体链接，不再有单独的「访问域名」按钮
    expect(markup).toContain('href="https://mx.ooo"');
    expect(markup).not.toContain("domain-visit");
  });

  it("普通域名不渲染精品星标", () => {
    const markup = renderCard({ ...domain, is_featured: false });

    expect(markup).not.toContain("domain-featured-badge");
    expect(markup).not.toContain("featured-star");
    expect(markup).toContain('class="registration-range date-unknown"');
    expect(markup).toContain('href="https://mx.ooo"');
  });

  it("有简介时显示简介文案", () => {
    const markup = renderCard({ ...domain, description: "这是一个简短的品牌介绍" });

    expect(markup).toContain("这是一个简短的品牌介绍");
    expect(markup).not.toContain("placeholder");
  });

  it("7 天内渲染紧急角标，30 天内渲染警告，已过期渲染过期标记", () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const markup = renderCard({ ...domain, registered_at: "2015-05-12T00:00:00.000Z", expires_at: soon });

    expect(markup).toContain(`2015.05.12-${dottedDate(soon)}`);
    expect(markup).toContain("is-urgent");
    expect(markup).toMatch(/\d+ Days/);

    const warningDate = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const warning = renderCard({ ...domain, expires_at: warningDate });
    expect(warning).toContain("is-warning");
    expect(warning).toContain("Days");

    const past = renderCard({ ...domain, expires_at: "2020-01-07T00:00:00.000Z" });
    expect(past).toContain("is-expired");
  });

  it("不同域名主体共用同一种后缀徽章", () => {
    expect(renderCard()).not.toContain("data-type=");
    expect(renderCard({ ...domain, domain: "094.org", name: "094", tld: "org" })).toContain('class="tld-badge">.org</span>');
    expect(renderCard({ ...domain, domain: "a-1.com", name: "a-1", tld: "com" })).toContain('class="tld-badge">.com</span>');
  });

  it("充裕到期日期正常显示且无紧急标记", () => {
    const far = new Date(Date.now() + 300 * 86_400_000).toISOString();
    const markup = renderCard({ ...domain, expires_at: far });
    expect(markup).toContain("Date pending");
    expect(markup).toMatch(/\d+ Days/);
    expect(markup).not.toContain("is-urgent");
    expect(markup).not.toContain("is-urgent");
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
    expect(markup).toContain("View details →");
  });

  it("普通域名速览不显示独立详情页入口", () => {
    const markup = renderDialog({ ...domain, is_featured: false });
    expect(markup).not.toContain("detail-page-link");
    expect(markup).not.toContain("View details");
  });

  it("显示价值维度、外部查询与分组后的相似域名", () => {
    const markup = renderDialog(domain);

    expect(markup).toContain("Domain profile");
    expect(markup).toContain("Composition");
    expect(markup).toContain("Letters");
    expect(markup).toContain("WHOIS");
    expect(markup).toContain('href="https://whois.com/whois/mx.ooo" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('href="https://web.archive.org/web/*/mx.ooo" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('href="https://www.infibeam.com/" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain("Same TLD");
    expect(markup).toContain("Same length");
    expect(markup).not.toMatch(/购买|注册引导/);
  });
});
