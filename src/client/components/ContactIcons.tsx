import { Mail, MessageCircle, Send } from "lucide-react";
import { siQq, siWechat, siX, siXiaohongshu, type SimpleIcon } from "simple-icons";

export interface ContactSettings {
  contact_email: string | null; contact_telegram: string | null; contact_whatsapp: string | null;
  contact_x: string | null; contact_xiaohongshu: string | null; contact_wechat: string | null;
  contact_qq: string | null; wechat_qr_url: string | null;
}

function BrandIcon({ icon }: { icon: SimpleIcon }) { return <svg className="brand-contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icon.path} /></svg>; }
const handleUrl = (value: string, base: string) => /^https?:\/\//i.test(value) ? value : `${base}${value.replace(/^@/, "")}`;
interface ContactLinkItem { key: string; href: string; ariaLabel: string; icon: React.JSX.Element; external: boolean; }

export function ContactLinks({ settings }: { settings: ContactSettings | null | undefined }) {
  const configuredContacts = ([
    settings?.contact_email ? { key: "email", href: `mailto:${settings.contact_email}`, ariaLabel: `发送邮件至 ${settings.contact_email}`, icon: <Mail aria-hidden="true" />, external: false } : null,
    settings?.contact_telegram ? { key: "telegram", href: handleUrl(settings.contact_telegram, "https://t.me/"), ariaLabel: `通过 Telegram 联系 ${settings.contact_telegram}`, icon: <Send aria-hidden="true" />, external: true } : null,
    settings?.contact_whatsapp ? { key: "whatsapp", href: `https://wa.me/${settings.contact_whatsapp.replace(/\D/g, "")}`, ariaLabel: `通过 WhatsApp 联系 ${settings.contact_whatsapp}`, icon: <MessageCircle aria-hidden="true" />, external: true } : null,
    settings?.contact_x ? { key: "x", href: handleUrl(settings.contact_x, "https://x.com/"), ariaLabel: `在 X 联系 ${settings.contact_x}`, icon: <BrandIcon icon={siX} />, external: true } : null,
    settings?.contact_xiaohongshu ? { key: "xiaohongshu", href: handleUrl(settings.contact_xiaohongshu, "https://www.xiaohongshu.com/user/profile/"), ariaLabel: "通过小红书联系", icon: <BrandIcon icon={siXiaohongshu} />, external: true } : null,
    settings?.contact_wechat ? { key: "wechat", href: settings.wechat_qr_url || `weixin://dl/chat?${encodeURIComponent(settings.contact_wechat)}`, ariaLabel: `通过微信联系 ${settings.contact_wechat}`, icon: <BrandIcon icon={siWechat} />, external: Boolean(settings.wechat_qr_url) } : null,
    settings?.contact_qq ? { key: "qq", href: `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(settings.contact_qq)}&site=qq&menu=yes`, ariaLabel: `通过 QQ 联系 ${settings.contact_qq}`, icon: <BrandIcon icon={siQq} />, external: true } : null,
  ] satisfies Array<ContactLinkItem | null>).filter((contact): contact is ContactLinkItem => contact !== null);

  return configuredContacts.length > 0 ? <div className="hero-contact-links" aria-label="联系方式">{configuredContacts.map((contact) => <a className="hero-contact-link" key={contact.key} href={contact.href} aria-label={contact.ariaLabel} {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{contact.icon}</a>)}</div> : null;
}
