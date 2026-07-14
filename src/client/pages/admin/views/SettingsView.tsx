import { FormEvent, useEffect, useState } from "react";

import { api } from "../../../lib/api";
import { Panel } from "../Panel";
import type { Notify } from "../types";

interface SiteSettingsForm {
  site_name: string;
  site_description: string;
  site_bio: string | null;
  accent_color: string;
  display_density: "compact" | "comfortable" | "spacious";
  featured_first: number;
  show_prices: number;
  copyright_text: string | null;
  icp_number: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  contact_telegram: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  wechat_qr_url: string | null;
}

const UPLOAD_TARGETS = [
  ["logo", "Logo"],
  ["favicon", "Favicon"],
  ["wechatQr", "微信二维码"],
] as const;

export function SettingsView({ notify }: { notify: Notify }) {
  const [form, setForm] = useState<SiteSettingsForm | null>(null);

  useEffect(() => {
    api<SiteSettingsForm>("/api/admin/settings")
      .then(setForm)
      .catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "设置加载失败", "error"));
  }, [notify]);

  if (!form) return <div className="skeleton-card" style={{ minHeight: 200 }} />;

  function field<K extends keyof SiteSettingsForm>(key: K, value: SiteSettingsForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          featured_first: Boolean(form.featured_first),
          show_prices: Boolean(form.show_prices),
        }),
      });
      notify("站点设置已保存并影响前台");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败", "error");
    }
  }

  async function upload(file: File, target: (typeof UPLOAD_TARGETS)[number][0]) {
    const body = new FormData();
    body.set("file", file);
    body.set("target", target);
    try {
      const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body });
      field(target === "logo" ? "logo_url" : target === "favicon" ? "favicon_url" : "wechat_qr_url", result.url);
      notify("图片已上传到 R2");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "上传失败", "error");
    }
  }

  return (
    <Panel title="站点设置" description="保存到 D1，前台刷新后生效">
      <form className="form-stack" onSubmit={(event) => void save(event)}>
        <div className="form-grid">
          <label className="field">
            <span>站点名称</span>
            <input value={form.site_name} onChange={(event) => field("site_name", event.target.value)} />
          </label>
          <label className="field">
            <span>分享卡片强调色</span>
            <input
              type="color"
              value={form.accent_color}
              onChange={(event) => field("accent_color", event.target.value)}
              style={{ padding: 4, cursor: "pointer" }}
            />
            <small style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              用于生成域名分享图（OG）。站点主色由黑金主题固定。
            </small>
          </label>
          <label className="field wide">
            <span>站点描述（前台副标题）</span>
            <input
              value={form.site_description}
              onChange={(event) => field("site_description", event.target.value)}
            />
          </label>
          <label className="field wide">
            <span>品牌简介 Bio</span>
            <input
              value={form.site_bio ?? ""}
              onChange={(event) => field("site_bio", event.target.value || null)}
              maxLength={500}
              placeholder="一句话介绍你的域名收藏"
            />
          </label>
          <label className="field">
            <span>页面密度</span>
            <select
              value={form.display_density}
              onChange={(event) => field("display_density", event.target.value as SiteSettingsForm["display_density"])}
            >
              <option value="compact">紧凑</option>
              <option value="comfortable">舒适</option>
              <option value="spacious">宽松</option>
            </select>
          </label>
          <label className="field">
            <span>ICP 备案号</span>
            <input value={form.icp_number ?? ""} onChange={(event) => field("icp_number", event.target.value || null)} />
          </label>
          <label className="field">
            <span>公开联系邮箱</span>
            <input
              type="email"
              value={form.contact_email ?? ""}
              onChange={(event) => field("contact_email", event.target.value || null)}
            />
          </label>
          <label className="field">
            <span>微信</span>
            <input
              value={form.contact_wechat ?? ""}
              onChange={(event) => field("contact_wechat", event.target.value || null)}
            />
          </label>
          <label className="field">
            <span>Telegram</span>
            <input
              value={form.contact_telegram ?? ""}
              onChange={(event) => field("contact_telegram", event.target.value || null)}
            />
          </label>
          <label className="field">
            <span>版权文字</span>
            <input
              value={form.copyright_text ?? ""}
              onChange={(event) => field("copyright_text", event.target.value || null)}
              placeholder="留空使用动态年份"
            />
          </label>
        </div>

        <label className="check-row">
          <input
            type="checkbox"
            className="check"
            checked={Boolean(form.featured_first)}
            onChange={(event) => field("featured_first", event.target.checked ? 1 : 0)}
          />
          精品优先展示
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            className="check"
            checked={Boolean(form.show_prices)}
            onChange={(event) => field("show_prices", event.target.checked ? 1 : 0)}
          />
          前台显示已审核价格
        </label>

        <div className="upload-grid">
          {UPLOAD_TARGETS.map(([target, label]) => (
            <label className="upload-card" key={target}>
              <span>{label}</span>
              <small>PNG / JPEG / WebP，最大 2 MB</small>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/x-icon"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file, target);
                }}
              />
            </label>
          ))}
        </div>

        <button className="btn btn-primary" style={{ justifySelf: "start" }}>
          保存设置
        </button>
      </form>
    </Panel>
  );
}
