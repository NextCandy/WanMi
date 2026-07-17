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

/** 与组件同源的本地时区日期格式化：toISOString 是 UTC，跨时区会差一天 */
function localDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("DomainCard", () => {
  it("按徽章行、衬线域名与到期行的层级渲染精品卡片", () => {
    const markup = renderCard();

    expect(markup).toContain('class="domain-card featured"');
    // 徽章行：金色 TLD 徽章 + 分类徽章（精品带星与「· 精品」后缀）
    expect(markup).toContain('class="tld-badge">.ooo</span>');
    expect(markup).toContain('class="category-badge"');
    expect(markup).toContain("纯字母 · 精品");
    expect(markup).toContain('<strong>mx</strong>');
    expect(markup).toContain('class="domain-tld">.ooo</span>');
    expect(markup).toContain('class="domain-description placeholder"');
    // 到期行：精品星标 + 无到期数据时显示「长期持有」
    expect(markup).toContain('class="domain-featured-badge"');
    expect(markup).toContain("长期持有");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="复制 mx.ooo"');
    expect(markup).toContain('aria-label="速览 mx.ooo"');
    // 访问入口是域名本体链接，不再有单独的「访问域名」按钮
    expect(markup).toContain('href="https://mx.ooo"');
    expect(markup).not.toContain("domain-visit");
  });

  it("普通域名不渲染精品标记与「· 精品」后缀", () => {
    const markup = renderCard({ ...domain, is_featured: false });

    expect(markup).not.toContain("domain-featured-badge");
    expect(markup).not.toContain("· 精品");
    expect(markup).toContain('class="expiry-spacer"');
    expect(markup).toContain('href="https://mx.ooo"');
  });

  it("有简介时显示简介文案", () => {
    const markup = renderCard({ ...domain, description: "这是一个简短的品牌介绍" });

    expect(markup).toContain("这是一个简短的品牌介绍");
    expect(markup).not.toContain("placeholder");
  });

  it("临近到期渲染紧急标记，已过期渲染过期标记", () => {
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const markup = renderCard({ ...domain, registered_at: "2015-05-12T00:00:00.000Z", expires_at: soon });

    expect(markup).toContain(`${localDate(soon)} 到期`);
    expect(markup).toContain("is-urgent");
    expect(markup).toContain("（紧急）");

    const past = renderCard({ ...domain, expires_at: "2020-01-07T00:00:00.000Z" });
    expect(past).toContain("is-expired");
    expect(past).toContain("（已过期）");
  });

  it("充裕到期日期正常显示且无紧急标记", () => {
    const far = new Date(Date.now() + 300 * 86_400_000).toISOString();
    const markup = renderCard({ ...domain, expires_at: far });
    expect(markup).toContain(`${localDate(far)} 到期`);
    expect(markup).not.toContain("is-urgent");
    expect(markup).not.toContain("（紧急）");
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
