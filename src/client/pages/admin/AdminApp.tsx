import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

import { BrandMark } from "../../components/AppShell";
import {
  IconArrowUpRight,
  IconBell,
  IconDoc,
  IconGlobe,
  IconHome,
  IconLogout,
  IconSettings,
  IconShield,
  IconTag,
} from "../../components/icons";
import { Toast, type ToastMessage } from "../../components/Toast";
import { ApiError, api } from "../../lib/api";
import type { AdminUser, AdminView } from "./types";
import { CategoriesView } from "./views/CategoriesView";
import { DomainsView } from "./views/DomainsView";
import { LogsView } from "./views/LogsView";
import { NotificationsView } from "./views/NotificationsView";
import { OverviewView } from "./views/OverviewView";
import { SecurityView } from "./views/SecurityView";
import { SettingsView } from "./views/SettingsView";

const NAV: Array<[AdminView, string, ReactNode]> = [
  ["overview", "概览", <IconHome size={19} key="i" />],
  ["domains", "域名管理", <IconGlobe size={19} key="i" />],
  ["categories", "分类", <IconTag size={19} key="i" />],
  ["settings", "站点设置", <IconSettings size={19} key="i" />],
  ["notifications", "到期提醒", <IconBell size={19} key="i" />],
  ["security", "账户安全", <IconShield size={19} key="i" />],
  ["logs", "操作日志", <IconDoc size={19} key="i" />],
];

function LoginPage({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ user: { id: number; email: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin({ ...result.user, sessionId: "current" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <BrandMark />
        <span className="login-kicker">安全管理控制台</span>
        <h1>欢迎回来</h1>
        <p>请使用管理员账号继续。</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>管理员邮箱</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <div className="field-error">{error}</div>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "正在验证…" : "登录"}
          </button>
        </form>
        <a className="back-link" href="/" style={{ marginTop: 20, justifyContent: "center", display: "flex" }}>
          ← 返回域名展示页
        </a>
      </div>
    </div>
  );
}

export function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AdminView>("overview");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [presetTld, setPresetTld] = useState<string | undefined>(undefined);

  const notify = useCallback(
    (text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone }),
    [],
  );

  useEffect(() => {
    api<AdminUser>("/api/auth/me")
      .then(setUser)
      .catch((reason: unknown) => {
        if (!(reason instanceof ApiError) || reason.status !== 401) {
          notify(reason instanceof Error ? reason.message : "会话检查失败", "error");
        }
      })
      .finally(() => setChecking(false));
  }, [notify]);

  if (checking) {
    return (
      <div className="app-loading">
        <span className="brand-mark">玩</span>
        <p>正在验证玩米会话…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={(loggedIn) => {
          setUser(loggedIn);
          setView("overview");
        }}
      />
    );
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <BrandMark />
        <nav aria-label="后台导航">
          {NAV.map(([key, label, icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{user.email}</strong>
            <span>管理员</span>
          </div>
          <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => void logout()} aria-label="退出登录" title="退出登录">
            <IconLogout size={17} />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <h1>{NAV.find(([key]) => key === view)?.[1]}</h1>
          <div className="admin-header-actions">
            <a className="btn btn-secondary btn-sm" href="/" target="_blank" rel="noreferrer">
              查看前台 <IconArrowUpRight size={15} />
            </a>
          </div>
        </header>

        <main className="admin-content">
          {view === "overview" && (
            <OverviewView
              onTldClick={(tld) => {
                setPresetTld(tld);
                setView("domains");
              }}
            />
          )}
          {view === "domains" && <DomainsView key={presetTld ?? "all"} notify={notify} presetTld={presetTld} />}
          {view === "categories" && <CategoriesView notify={notify} />}
          {view === "settings" && <SettingsView notify={notify} />}
          {view === "notifications" && <NotificationsView notify={notify} />}
          {view === "security" && <SecurityView user={user} notify={notify} />}
          {view === "logs" && <LogsView />}
        </main>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
