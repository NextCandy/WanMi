import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactLinks, type ContactSettings } from "../../src/client/components/ContactIcons";

const settings: ContactSettings = {
  contact_email: "955555@gmail.com",
  contact_telegram: null,
  contact_whatsapp: null,
  contact_x: "iWangGang",
  contact_xiaohongshu: null,
  contact_wechat: null,
  contact_qq: "307203",
  wechat_qr_url: null,
};

describe("ContactLinks", () => {
  it("将所有联系方式渲染成只有图标的可访问链接", () => {
    const markup = renderToStaticMarkup(createElement(ContactLinks, { settings }));

    expect(markup.match(/class="hero-contact-link"/g)).toHaveLength(3);
    expect(markup).not.toContain("<span");
    expect(markup).not.toContain(" title=");
    expect(markup).toContain('href="mailto:955555@gmail.com"');
    expect(markup).toContain('href="https://x.com/iWangGang"');
    expect(markup).toContain("uin=307203");
    expect(markup).toContain('aria-label="发送邮件至 955555@gmail.com"');
  });
});
