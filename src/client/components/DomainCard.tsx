import { Fragment } from "react";

import { domainCategories } from "../lib/site";
import type { PublicDomain } from "../../shared/types/api";
import { IconArrowUpRight, IconCopy } from "./icons";
import { Badge } from "./ui";

/** 域名越长字号越小，避免长字符串撑破卡片；配合 CSS 的 overflow-wrap: anywhere 兜底 */
function lengthClass(domain: string): string {
  if (domain.length > 22) return "x-long";
  if (domain.length > 15) return "long";
  return "";
}

/** 卡片最多展示 2 个分类标签，避免堆砌 Badge 淹没域名本身 */
const MAX_CARD_CATEGORIES = 2;

/**
 * 点击域名直接打开该域名本身（不再进入站内详情页）。
 * 外链一律新开标签页：noopener/noreferrer 防止 window.opener 劫持，
 * nofollow 避免把站点权重传给这些待售域名。
 */
const EXTERNAL_LINK = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
} as const;

function domainUrl(domain: string): string {
  return `https://${domain}`;
}

export function DomainCard({
  domain,
  onCopy,
  index = 0,
}: {
  domain: PublicDomain;
  onCopy: (name: string) => void;
  index?: number;
}) {
  const categories = domainCategories(domain).slice(0, MAX_CARD_CATEGORIES);
  return (
    <article
      className={`domain-card${domain.is_featured ? " featured" : ""}`}
      style={{ animationDelay: `${Math.min(index * 18, 320)}ms` }}
    >
      <a
        className="domain-cover"
        href={domainUrl(domain.domain)}
        aria-label={`打开 ${domain.domain}`}
        {...EXTERNAL_LINK}
      />
      <span className="domain-avatar" aria-hidden="true">
        {domain.name.slice(0, 1)}
      </span>
      <div className="domain-body">
        <div className="domain-title">
          <h3 className={`domain-name ${lengthClass(domain.domain)}`}>
            {domain.name}
            <em>.{domain.tld}</em>
          </h3>
          {domain.is_featured && <Badge tone="gold">精品</Badge>}
        </div>
        {domain.description && <p className="domain-desc">{domain.description}</p>}
        <div className="domain-meta">
          <span>.{domain.tld.toUpperCase()}</span>
          <span className="dot">·</span>
          <span>{domain.name.length} 字符</span>
          {/* 每个分类单独成元素，分隔点不并入文本，便于读屏与精确匹配 */}
          {categories.map((category) => (
            <Fragment key={category}>
              <span className="dot">·</span>
              <span>{category}</span>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="domain-actions">
        <button
          onClick={() => onCopy(domain.domain)}
          aria-label={`复制 ${domain.domain}`}
          title={`复制 ${domain.domain}`}
        >
          <IconCopy size={16} />
        </button>
      </div>
    </article>
  );
}

/** 首页「最近添加 / 最近更新」用的紧凑行式条目 */
export function DomainRow({ domain }: { domain: PublicDomain }) {
  const categories = domainCategories(domain).slice(0, MAX_CARD_CATEGORIES);
  return (
    <a
      className="recent-item"
      href={domainUrl(domain.domain)}
      aria-label={`打开 ${domain.domain}`}
      {...EXTERNAL_LINK}
    >
      <span className="domain-avatar" aria-hidden="true">
        {domain.name.slice(0, 1)}
      </span>
      <div className="recent-body">
        <div className="recent-name">
          {domain.name}
          <em>.{domain.tld}</em>
        </div>
        <div className="recent-meta">
          {domain.is_featured && <Badge tone="gold">精品</Badge>}
          <span>.{domain.tld.toUpperCase()}</span>
          <span className="dot">·</span>
          <span>{domain.name.length} 字符</span>
          {categories.map((category) => (
            <Fragment key={category}>
              <span className="dot">·</span>
              <span>{category}</span>
            </Fragment>
          ))}
        </div>
      </div>
      <IconArrowUpRight size={18} />
    </a>
  );
}
