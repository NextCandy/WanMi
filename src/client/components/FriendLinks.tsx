import { useState } from "react";

import type { FriendLink } from "../../shared/types/api";

/**
 * LOGO 多为站外地址，随时可能取不到。加载失败就退回纯文字，
 * 手机端只显示 LOGO 的那一档也据此恢复名字，不会留下一个空链接。
 */
function FriendLinkItem({ link }: { link: FriendLink }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = link.display_mode === "text_only" || logoFailed ? null : link.logo_url;
  const showName = link.display_mode !== "logo_only" || !logo;
  return (
    <a
      className={`footer-friend-link${logo ? " has-logo" : ""}`}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={link.name}
    >
      {/* 不用 loading="lazy"：图未到时 width:auto 算作 0，零尺寸元素不会触发懒加载，
          于是永远停在未加载状态。页脚只有寥寥几张小图，直接加载即可。 */}
      {logo ? (
        <img
          className="friend-link-logo"
          src={logo}
          alt={showName ? "" : link.name}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      {showName ? <span>{link.name}</span> : null}
    </a>
  );
}

/** 页脚左侧友情链接 */
export function FriendLinks({ links }: { links: FriendLink[] | null | undefined }) {
  if (!links || links.length === 0) return null;
  return (
    <div className="footer-friend-links" aria-label="友情链接">
      {links.map((link) => <FriendLinkItem key={link.id} link={link} />)}
    </div>
  );
}
