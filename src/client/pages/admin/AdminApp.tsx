import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Toast, type ToastMessage } from "../../components/Toast";
// 后台专属样式：AdminApp 本身是懒加载的，样式随 admin chunk 一起按需加载，不进前台首屏
import "../../styles/admin.css";
import { useIsCompactLayout, useVirtualRows } from "../../hooks/useVirtualRows";
import { ApiError, api, download } from "../../lib/api";
import { formatExact, formatRelative } from "../../lib/format-time";
import { chunkIds, hasMoreRows } from "../../lib/virtual-rows";
import { LOG_GROUP_LABELS, type LogActionGroup } from "../../../shared/log-analytics";

type AdminView = "overview" | "domains" | "categories" | "settings" | "notifications" | "security" | "logs";

interface AdminUser {
  id: number;
  email: string;
  sessionId: string;
}

interface DashboardData {
  counts: { total: number; listed: number; hidden: number; featured: number };
  expiringSoonCount: number;
  expiringTrend: Array<{ month: string; count: number }>;
  categorySpread: Array<{ category: string; count: number }>;
  expiring90d: Array<{ full_domain: string; expires_at: string }>;
  tlds: Array<{ tld: string; count: number }>;
  recentLogs: Array<{ id: number; level: string; action: string; message: string; success: number; created_at: string }>;
  hasExpirationData: boolean;
  notificationHealth: Array<{ channel: NotificationChannelKey; enabled: number; last_test: string | null }>;
  stats: { today: { pv: number; uv: number }; sevenDays: Array<{ day: string; pv: number; uv: number }>; topDomains: Array<{ domain: string; clicks: number; latest: number }>; countries: Array<{ country: string; visitors: number }> };
}

interface AdminDomain {
  id: number;
  full_domain: string;
  name: string;
  tld: string;
  category: string | null;
  is_featured: number;
  is_listed: number;
  notes: string | null;
  description: string;
  auto_category: string;
  auto_subcategory: string;
  auto_category_confidence: number;
  effective_category: string;
  category_source: "auto" | "manual";
  registered_at: string | null;
  expires_at: string | null;
  registrar_name: string | null;
}

interface AdminDomainPage {
  items: AdminDomain[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

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
        <a href="/" className="brand login-brand"><img className="brand-mark-img" src="/logo.svg" alt="" /><span>DOMAIN HUNTER</span></a>
        <div className="login-heading"><span>安全管理控制台</span><h1>欢迎回来</h1><p>请使用管理员账号继续。</p></div>
        <form onSubmit={submit}>
          <label>管理员邮箱<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></label>
          <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="inline-error">{error}</div>}
          <button className="primary-button login-button" disabled={loading}>{loading ? "正在验证…" : "登录"}</button>
        </form>
        <a className="back-link" href="/">← 返回域名展示页</a>
      </div>
    </div>
  );
}

function Panel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="admin-panel"><div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="panel-actions">{actions}</div>}</div>{children}</section>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="toggle-control">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="toggle-track" aria-hidden="true"><span /></span>
    <span className="toggle-label">{label}</span>
  </label>;
}

function calendarDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ExpiryCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = new Date(year, month, 1).getDay();
  const [domains, setDomains] = useState<AdminDomain[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams({
      page: "1",
      pageSize: "200",
      orderBy: "expires_at",
      dir: "asc",
      expiresFrom: calendarDate(year, month, 1),
      expiresTo: calendarDate(year, month, daysInMonth),
    });
    void api<AdminDomainPage>(`/api/admin/domains?${query}`).then((result) => setDomains(result.items)).catch(() => setFailed(true));
  }, [daysInMonth, month, year]);

  const domainsByDay = new Map<number, AdminDomain[]>();
  for (const domain of domains ?? []) {
    if (!domain.expires_at) continue;
    const expires = new Date(domain.expires_at);
    if (Number.isNaN(expires.getTime()) || expires.getFullYear() !== year || expires.getMonth() !== month) continue;
    const day = expires.getDate();
    domainsByDay.set(day, [...(domainsByDay.get(day) ?? []), domain]);
  }
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return <section className="expiry-calendar" aria-labelledby="expiry-calendar-title">
    <header><div><h3 id="expiry-calendar-title">{year} 年 {month + 1} 月到期月历</h3><p>金色标记到期日，7 天内自动标红。</p></div><span>{domains?.length ?? 0} 个域名</span></header>
    <div className="expiry-calendar-grid" role="grid" aria-label={`${year} 年 ${month + 1} 月域名到期日历`}>
      {["日", "一", "二", "三", "四", "五", "六"].map((label) => <span className="calendar-weekday" role="columnheader" key={label}>{label}</span>)}
      {cells.map((day, index) => {
        if (day === null) return <span className="calendar-day is-empty" aria-hidden="true" key={`empty-${index}`} />;
        const expiring = domainsByDay.get(day) ?? [];
        const current = new Date(year, month, day);
        const remaining = Math.ceil((current.getTime() - new Date(year, month, today.getDate()).getTime()) / 86_400_000);
        const urgent = expiring.length > 0 && remaining >= 0 && remaining < 7;
        const title = expiring.length ? `${calendarDate(year, month, day)}\n${expiring.map((domain) => domain.full_domain).join("\n")}` : calendarDate(year, month, day);
        return <span className={`calendar-day${expiring.length ? " has-expiry" : ""}${urgent ? " is-urgent" : ""}`} role="gridcell" title={title} aria-label={expiring.length ? `${month + 1} 月 ${day} 日，${expiring.length} 个域名到期` : `${month + 1} 月 ${day} 日`} key={day}><b>{day}</b>{expiring.length > 0 && <i aria-hidden="true" />}</span>;
      })}
    </div>
    {failed && <div className="empty-inline">到期月历暂时无法读取</div>}
  </section>;
}

function OverviewView({ onTldClick, onDomainClick, onNavigate, notify }: { onTldClick: (tld: string) => void; onDomainClick?: (domain: string) => void; onNavigate: (view: AdminView) => void; notify: (text: string, tone?: "success" | "error") => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<DashboardData>("/api/admin/dashboard").then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "概览加载失败"));
  }, []);
  if (error) return <div className="state-panel error-panel">{error}</div>;
  if (!data) return <div className="state-panel">正在读取真实统计…</div>;
  const cards: Array<[string, number, string]> = [
    ["域名总数", data.counts.total, "tone-a"],
    ["即将到期", data.expiringSoonCount, "tone-b"],
    ["精品域名", data.counts.featured, "tone-c"],
    ["已隐藏", data.counts.hidden, "tone-d"],
  ];
  const trendData = data.expiringTrend.map((point) => ({ ...point, label: `${Number(point.month.slice(5))} 月` }));
  const expiryShare = [
    { name: "即将到期", value: Math.max(0, data.expiringSoonCount), fill: "var(--warning)" },
    { name: "正常", value: Math.max(0, data.counts.total - data.expiringSoonCount), fill: "var(--brand)" },
  ];
  const maxCategory = Math.max(1, ...data.categorySpread.map((item) => Number(item.count)));
  async function exportAll() {
    try { await download("/api/admin/domains/export"); notify("CSV 已开始下载"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "CSV 导出失败", "error"); }
  }
  return <div className="admin-stack">
    <div className="stat-grid">{cards.map(([label, value, tone]) => <div className={`stat-card ${tone}`} key={label}><span>{label}</span><strong>{Number(value).toLocaleString("zh-CN")}</strong></div>)}</div>
    <div className="quick-actions" role="group" aria-label="快捷操作">
      <button type="button" onClick={() => onNavigate("domains")}><Globe aria-hidden="true" />添加域名</button>
      <button type="button" onClick={() => onNavigate("domains")}><LayoutDashboard aria-hidden="true" />批量 CSV 导入</button>
      <button type="button" onClick={() => void exportAll()}><History aria-hidden="true" />导出 CSV</button>
      <button type="button" onClick={() => onNavigate("notifications")}><Bell aria-hidden="true" />到期提醒设置</button>
    </div>
    <div className="overview-analytics-grid">
      <Panel title="到期占比" description="90 天内到期与正常域名">
        <div className="expiry-donut">
          <ResponsiveContainer width="100%" height={190}><PieChart><Pie data={expiryShare} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={data.counts.total ? 2 : 0} stroke="var(--surface)" strokeWidth={2}>{expiryShare.map((item) => <Cell key={item.name} fill={item.fill} />)}</Pie><Tooltip formatter={(value) => [`${Number(value ?? 0)} 个`, "域名"]} /></PieChart></ResponsiveContainer>
          <div><strong>{data.expiringSoonCount.toLocaleString("zh-CN")}</strong><span>即将到期</span></div>
        </div>
      </Panel>
      <Panel title="到期趋势" description="未来 6 个月按月统计">
        {trendData.length ? <ResponsiveContainer width="100%" height={200}><LineChart data={trendData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><Tooltip formatter={(value) => [`${Number(value ?? 0)} 个`, "到期域名"]} /><Line type="monotone" dataKey="count" name="到期域名" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--brand)" }} /></LineChart></ResponsiveContainer> : <div className="empty-inline">暂无未来 6 个月内到期的域名</div>}
      </Panel>
      <Panel title="分类分布" description="人工分类优先，其余按自动标签">
        <div className="distribution-list">{data.categorySpread.map((item) => <div className="distribution-static" key={item.category}><span>{item.category}</span><div className="bar"><i style={{ width: `${Math.max(4, Number(item.count) / maxCategory * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div>
      </Panel>
    </div>
    <div className="stats-overview"><div className="stats-kpis"><div><span>今日 PV</span><strong>{data.stats.today.pv ?? 0}</strong></div><div><span>今日 UV</span><strong>{data.stats.today.uv ?? 0}</strong></div><div><span>域名点击</span><strong>{data.stats.topDomains.reduce((total, item) => total + Number(item.clicks || 0), 0)}</strong></div></div><div className="stats-chart"><ResponsiveContainer width="100%" height={180}><LineChart data={data.stats.sevenDays}><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Line type="monotone" dataKey="pv" stroke="var(--brand)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="uv" stroke="var(--premium)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div>
    <div className="admin-two-columns"><Panel title="域名点击 Top 10"><div className="kpi-list">{data.stats.topDomains.length ? data.stats.topDomains.map((item) => <button key={item.domain} onClick={() => onDomainClick?.(item.domain)}><span className="mono">{item.domain}</span><b>{item.clicks} 次</b><small title={formatExact(item.latest * 1000)}>{formatRelative(item.latest * 1000)}</small></button>) : <div className="empty-inline">尚无域名点击</div>}</div></Panel><Panel title="访客地区 Top 5"><div className="kpi-list">{data.stats.countries.map((item) => <div key={item.country}><span>{item.country}</span><b>{item.visitors}</b></div>)}</div></Panel></div>
    <Panel title="后缀分布" description="点击跳转到筛选后的域名管理"><div className="distribution-list">{data.tlds.slice(0, 12).map((item) => <a key={item.tld} onClick={() => onTldClick(item.tld)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onTldClick(item.tld); }}><span>.{item.tld}</span><div className="bar"><i style={{ width: `${Math.max(4, item.count / Math.max(data.counts.total, 1) * 100)}%` }} /></div><strong>{item.count}</strong></a>)}</div></Panel>
    <div className="admin-two-columns">
      <Panel title="90 天内到期"><div className="kpi-list">{data.expiring90d.length ? data.expiring90d.map((item) => <div key={item.full_domain}><span className="mono">{item.full_domain}</span><b>{new Date(item.expires_at).toLocaleDateString("zh-CN")}</b></div>) : <div className="empty-inline">暂无 90 天内到期的域名（或尚无到期数据）</div>}</div></Panel>
    </div>
    <div className="admin-two-columns">
      <Panel title="最近操作"><div className="activity-list">{data.recentLogs.length ? data.recentLogs.map((log) => <div key={log.id}><span className={log.success ? "dot-success" : "dot-error"} /><div><strong>{log.message}</strong><small title={formatExact(log.created_at)}>{formatRelative(log.created_at)}</small></div></div>) : <div className="empty-inline">暂无操作记录</div>}</div></Panel>
      <Panel title="通知渠道健康"><div className="infra-list">{data.notificationHealth.map((item) => { const test = item.last_test ? JSON.parse(item.last_test) as { ok: boolean; at: string } : null; return <div key={item.channel}><span>{CHANNEL_LABELS[item.channel]}</span><strong className={test?.ok ? "status-ok" : test ? "status-error" : ""} title={test ? formatExact(test.at) : undefined}>{!item.enabled ? "未启用" : test ? `${test.ok ? "正常" : "失败"} · ${formatRelative(test.at)}` : "待测试"}</strong></div>; })}</div></Panel>
    </div>
  </div>;
}

type DomainOrderBy = "domain" | "expires_at";
const OPTIONAL_COLUMNS: Array<[string, string]> = [["description", "简介"], ["category", "人工分类"], ["expiry", "到期日期"], ["registrar", "注册商"]];
const DEFAULT_COLUMNS = ["category", "expiry"];
const DOMAIN_PAGE_SIZE = 100;
const DOMAIN_SEARCH_DEBOUNCE_MS = 300;
/** 必须与 bulkDomainSchema 的 ids 上限一致；选中数超过时前端自动分批提交 */
const BULK_ID_LIMIT = 500;
const ESTIMATED_ROW_HEIGHT = 72;
/** 行数低于此值时虚拟化收益为零，直接整段渲染 */
const VIRTUAL_MIN_ROWS = 60;
/** 选择、域名、精品、前台展示、操作五列固定存在，其余由列显示开关决定 */
const FIXED_COLUMN_COUNT = 5;

function loadColumns(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem("wanmi-admin-columns") ?? "null") as string[] | null;
    if (Array.isArray(stored)) return new Set(stored.filter((key) => OPTIONAL_COLUMNS.some(([k]) => k === key)));
  } catch { /* 使用默认列 */ }
  return new Set(DEFAULT_COLUMNS);
}

interface CategoryRow { id: number; name: string; domain_count: number; is_auto?: number }
interface DomainFilterOptions { tlds: Array<{ tld: string; count: number }>; categories: Array<{ name: string; count: number }> }

type BulkAction = "feature" | "unfeature" | "list" | "hide" | "delete" | "categorize";
/** 分类有专门的输入弹窗，其余动作走统一的确认弹窗 */
interface BulkConfirmState {
  action: Exclude<BulkAction, "categorize">;
  title: string;
  description: string;
  danger: boolean;
}

function DomainEditModal({ domain, onClose, onSaved, notify }: { domain: AdminDomain; onClose: () => void; onSaved: () => void; notify: (text: string, tone?: "success" | "error") => void }) {
  const [fullDomain, setFullDomain] = useState(domain.full_domain);
  const [tld, setTld] = useState(domain.tld);
  const [registeredAt, setRegisteredAt] = useState(domain.registered_at?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = useState(domain.expires_at?.slice(0, 10) ?? "");
  const [registrarName, setRegistrarName] = useState(domain.registrar_name ?? "");
  const [description, setDescription] = useState(domain.description ?? "");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/domains/${domain.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullDomain,
          tld: tld.replace(/^\./, ""),
          registeredAt: registeredAt || null,
          expiresAt: expiresAt || null,
          registrarName: registrarName || null,
          description,
        }),
      });
      notify(`${fullDomain} 已更新`);
      onSaved();
      onClose();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "域名信息保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><form className="domain-edit-modal" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="domain-edit-title">
    <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
    <div><span className="eyebrow">DOMAIN DETAILS</span><h2 id="domain-edit-title">编辑域名信息</h2><p>这些字段会同步用于前台详情和 CSV 导出。</p></div>
    <div className="domain-edit-grid">
      <label className="wide">域名<input value={fullDomain} onChange={(event) => setFullDomain(event.target.value.trim())} required /></label>
      <label>后缀<input value={tld} onChange={(event) => setTld(event.target.value.replace(/^\./, ""))} placeholder="com" required /></label>
      <label>注册商<input value={registrarName} onChange={(event) => setRegistrarName(event.target.value)} placeholder="例如 Spaceship" /></label>
      <label>注册日期<input type="date" value={registeredAt} onChange={(event) => setRegisteredAt(event.target.value)} /></label>
      <label>到期日期<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <div className="wide domain-edit-field"><label htmlFor="domain-description">简介（可选，手动填写）</label><textarea id="domain-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} /></div>
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存修改"}</button></div>
  </form></div>;
}

function BulkCategoryModal({ count, categories, onClose, onConfirm }: { count: number; categories: CategoryRow[]; onClose: () => void; onConfirm: (category: string | null) => Promise<void> }) {
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const creating = choice === "__new__";
  const resolved = creating ? newName.trim() : choice;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating && !newName.trim()) { setError("请填写新分类名称"); return; }
    setSaving(true);
    setError("");
    try {
      if (creating) await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      await onConfirm(resolved || null);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量设置分类失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><form className="domain-edit-modal bulk-category-modal" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bulk-category-title">
    <button type="button" className="modal-close" aria-label="关闭批量分类" onClick={onClose}>×</button>
    <div><span className="eyebrow">BULK CATEGORY</span><h2 id="bulk-category-title">批量设置分类</h2><p>将同一个人工分类应用到已选的 {count} 个域名。</p></div>
    <div className="domain-edit-grid bulk-category-form">
      <label className="wide">分类<select autoFocus value={choice} onChange={(event) => { setChoice(event.target.value); setError(""); }} aria-label="选择分类">
        <option value="">清除分类（恢复自动分类）</option>
        {categories.map((item) => <option key={item.id} value={item.name}>{item.name}（{item.domain_count}）</option>)}
        <option value="__new__">＋ 新建分类…</option>
      </select></label>
      {creating ? <label className="wide">新分类名称<input value={newName} onChange={(event) => { setNewName(event.target.value); setError(""); }} maxLength={80} placeholder="例如 四字母" /><small>提交时会先创建该分类，再应用到选中域名。</small></label> : null}
    </div>
    {error ? <div className="inline-error">{error}</div> : null}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>取消</button><button className="primary-button" disabled={saving}>{saving ? "应用中…" : resolved ? `归入「${resolved}」· ${count} 个` : `清除分类 · ${count} 个`}</button></div>
  </form></div>;
}

function BulkConfirmModal({ state, count, onClose, onConfirm }: { state: BulkConfirmState; count: number; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const batches = Math.ceil(count / BULK_ID_LIMIT);

  async function confirm() {
    setRunning(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量操作失败");
    } finally {
      setRunning(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="domain-edit-modal compact-confirm-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title">
    <button type="button" className="modal-close" aria-label="关闭批量确认" onClick={onClose}>×</button>
    <div><span className="eyebrow">CONFIRM BULK ACTION</span><h2 id="bulk-confirm-title">{state.title}</h2><p>{state.description}</p></div>
    <div className="bulk-confirm-summary">
      <div><span>选中域名</span><strong>{count}</strong></div>
      <div><span>即将执行</span><strong>{state.title}</strong></div>
      {batches > 1 ? <div><span>提交批次</span><strong>{batches} 批</strong></div> : null}
    </div>
    {error ? <div className="inline-error" role="alert">{error}</div> : null}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={running}>取消</button><button type="button" className={`primary-button ${state.danger ? "danger-button" : ""}`} onClick={() => void confirm()} disabled={running}>{running ? "执行中…" : `确认${state.title} ${count} 个`}</button></div>
  </div></div>;
}

interface ImportPreviewData {
  file: File;
  report: { parsedCount: number; invalidCount: number; duplicateCount: number };
  preview: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    newRows: number;
    existingRows: number;
    conflictRows: number;
    rows: Array<{ rowNumber: number; domain: string; status: "new" | "existing" }>;
    conflicts: Array<{
      rowNumber: number;
      domain: string;
      diffs: Array<{ field: string; label: string; currentValue: string; incomingValue: string }>;
    }>;
    issues: Array<{ rowNumber: number; domain: string; code: string; reason: string }>;
    truncated: boolean;
  };
}

function ImportPreviewModal({ data, onClose, onConfirm }: { data: ImportPreviewData; onClose: () => void; onConfirm: (mode: "skip" | "update") => Promise<void> }) {
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(mode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  const { preview } = data;
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="import-preview-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
    <button type="button" className="modal-close" aria-label="关闭导入预览" onClick={onClose}>×</button>
    <div className="import-preview-heading"><span className="eyebrow">CSV IMPORT PREVIEW</span><h2 id="import-preview-title">确认导入 {data.file.name}</h2><p>正式导入会在后端重新解析和校验；不会删除或隐藏 CSV 中未出现的现有域名。</p></div>
    <div className="import-preview-stats">
      <div><span>CSV 总行数</span><strong>{preview.totalRows}</strong></div>
      <div><span>有效唯一</span><strong>{preview.validRows}</strong></div>
      <div><span>将新增</span><strong>{preview.newRows}</strong></div>
      <div><span>已存在</span><strong>{preview.existingRows}</strong></div>
      <div><span>字段冲突</span><strong>{preview.conflictRows}</strong></div>
      <div><span>无效</span><strong>{preview.invalidRows}</strong></div>
      <div><span>文件内重复</span><strong>{preview.duplicateRows}</strong></div>
    </div>
    <fieldset className="conflict-mode"><legend>现有记录如何处理</legend><label className={mode === "skip" ? "active" : ""}><input type="radio" name="conflict-mode" checked={mode === "skip"} onChange={() => setMode("skip")} /><span><strong>跳过现有记录（默认）</strong><small>新增 {preview.newRows} 条，跳过 {preview.existingRows} 条；不覆盖人工设置。</small></span></label><label className={mode === "update" ? "active" : ""}><input type="radio" name="conflict-mode" checked={mode === "update"} onChange={() => setMode("update")} /><span><strong>更新现有记录</strong><small>新增 {preview.newRows} 条，更新 {preview.existingRows} 条；人工分类、精品、展示和备注仍受后端保护。</small></span></label></fieldset>
    <div className="import-preview-tables">
      <div><h3>记录预览</h3><div className="preview-table"><table><thead><tr><th>行号</th><th>域名</th><th>状态</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={`${row.rowNumber}-${row.domain}`}><td>{row.rowNumber}</td><td className="mono">{row.domain}</td><td><span className={row.status === "new" ? "badge-status badge-listed" : "badge-status badge-warning"}>{row.status === "new" ? "新增" : mode === "update" ? "将更新" : "将跳过"}</span></td></tr>)}</tbody></table></div></div>
      <div><h3>错误行</h3>{preview.issues.length ? <div className="preview-errors">{preview.issues.map((issue) => <div key={`${issue.rowNumber}-${issue.code}-${issue.domain}`}><strong>第 {issue.rowNumber} 行 · {issue.domain || "空域名"}</strong><span>{issue.reason}</span></div>)}</div> : <div className="empty-inline">没有错误行</div>}</div>
    </div>
    {preview.conflicts.length > 0 ? <div className="import-conflict-list">
      <h3>字段差异 · {preview.conflictRows} 条</h3>
      <p className="preview-note">只有选择「更新现有记录」才会写入下列变更；「跳过」模式不会改动这些域名。人工分类、精品和展示状态在两种模式下都受保护。</p>
      {preview.conflicts.map((conflict) => <div className="import-conflict-row" key={`${conflict.rowNumber}-${conflict.domain}`}>
        <strong className="mono">{conflict.domain}</strong>
        <div className="import-conflict-fields">{conflict.diffs.map((diff) => <div key={diff.field}>
          <span>{diff.label}</span>
          <del>{diff.currentValue || "（空）"}</del>
          <ins>{diff.incomingValue || "（空）"}</ins>
        </div>)}</div>
      </div>)}
    </div> : null}
    {preview.truncated && <p className="preview-note">预览仅显示前 120 条；统计数字覆盖完整文件。</p>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>取消</button><button type="button" className="primary-button" onClick={() => void confirm()} disabled={submitting}>{submitting ? "正在重新校验并导入…" : mode === "update" ? `确认新增 ${preview.newRows}、更新 ${preview.existingRows}` : `确认新增 ${preview.newRows}、跳过 ${preview.existingRows}`}</button></div>
  </section></div>;
}

function DomainsView({ notify, presetTld, presetQuery }: { notify: (text: string, tone?: "success" | "error") => void; presetTld?: string; presetQuery?: string }) {
  const [items, setItems] = useState<AdminDomain[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedPage, setLoadedPage] = useState(0);
  const [q, setQ] = useState(presetQuery ?? "");
  const [debouncedQ, setDebouncedQ] = useState(presetQuery ?? "");
  const [listed, setListed] = useState("");
  const [featured, setFeatured] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tld, setTld] = useState(presetTld ?? "");
  const [orderBy, setOrderBy] = useState<DomainOrderBy | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [columns, setColumns] = useState<Set<string>>(loadColumns);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<DomainFilterOptions>({ tlds: [], categories: [] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<AdminDomain | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirmState | null>(null);
  const requestRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const manualCategories = useMemo(() => categories.filter((item) => !item.is_auto), [categories]);
  const manualCategoryNames = useMemo(() => new Set(manualCategories.map((item) => item.name)), [manualCategories]);

  // 搜索按键去抖：否则每敲一个字符都会重置累积并重新拉取整页
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), DOMAIN_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const buildParams = useCallback((targetPage: number) => {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(DOMAIN_PAGE_SIZE) });
    if (debouncedQ) params.set("q", debouncedQ);
    if (listed) params.set("listed", listed);
    if (featured) params.set("featured", featured);
    if (categoryFilter) params.set("category", categoryFilter);
    if (tld) params.set("tld", tld);
    if (orderBy) { params.set("orderBy", orderBy); params.set("dir", dir); }
    return params;
  }, [categoryFilter, debouncedQ, dir, featured, listed, orderBy, tld]);

  // token 用于丢弃已被新筛选取代的过期响应，避免旧结果覆盖新列表
  const loadPage = useCallback(async (targetPage: number, mode: "replace" | "append") => {
    const token = ++requestRef.current;
    if (mode === "replace") setLoading(true); else setLoadingMore(true);
    try {
      const result = await api<AdminDomainPage>(`/api/admin/domains?${buildParams(targetPage)}`);
      if (token !== requestRef.current) return;
      setItems((current) => (mode === "replace" ? result.items : [...current, ...result.items]));
      setTotal(result.total);
      setLoadedPage(targetPage);
    } catch (reason) {
      if (token !== requestRef.current) return;
      notify(reason instanceof Error ? reason.message : "域名加载失败", "error");
    } finally {
      if (token === requestRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [buildParams, notify]);

  // 筛选、排序或写操作后回到第一页重新累积
  useEffect(() => { void loadPage(1, "replace"); }, [loadPage, refresh]);
  // 换筛选条件后清空选择：否则批量操作会作用到当前列表里看不见的域名
  useEffect(() => { setSelected(new Set()); }, [debouncedQ, listed, featured, categoryFilter, tld]);
  useEffect(() => {
    api<CategoryRow[]>("/api/admin/categories").then(setCategories).catch(() => setCategories([]));
    api<DomainFilterOptions>("/api/admin/domains/filters").then(setFilterOptions).catch(() => setFilterOptions({ tlds: [], categories: [] }));
  }, [refresh]);

  const hasMore = hasMoreRows(items.length, total);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadPage(loadedPage + 1, "append"); },
      { rootMargin: "320px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadedPage, loadPage]);

  const compact = useIsCompactLayout();
  const columnKey = useMemo(() => [...columns].sort().join(","), [columns]);
  const virtualEnabled = !compact && items.length >= VIRTUAL_MIN_ROWS;
  const { containerRef, start, end, topPad, bottomPad } = useVirtualRows({
    count: items.length,
    enabled: virtualEnabled,
    estimatedRowHeight: ESTIMATED_ROW_HEIGHT,
    measureKey: columnKey,
  });
  const visibleItems = useMemo(() => items.slice(start, end), [items, start, end]);
  const columnCount = FIXED_COLUMN_COUNT + OPTIONAL_COLUMNS.filter(([key]) => columns.has(key)).length;

  function toggleColumn(key: string) {
    setColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem("wanmi-admin-columns", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleSort(key: DomainOrderBy) {
    if (orderBy === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else { setOrderBy(key); setDir("asc"); }
  }
  const arrow = (key: DomainOrderBy) => orderBy === key ? <span className="sort-arrow">{dir === "asc" ? "↑" : "↓"}</span> : null;

  /** 到期单元格：30 天内红色警示，已过期同样标红并注明 */
  function expiryCell(domain: AdminDomain) {
    if (!domain.expires_at) return <span className="expiry-none">—</span>;
    const date = new Date(domain.expires_at);
    if (Number.isNaN(date.getTime())) return <span className="expiry-none">—</span>;
    const text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const remaining = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
    if (remaining < 0) return <span className="expiry-danger">{text}<small>已过期</small></span>;
    if (remaining <= 30) return <span className="expiry-danger">{text}<small>剩 {remaining} 天</small></span>;
    if (remaining <= 90) return <span className="expiry-warning">{text}<small>剩 {remaining} 天</small></span>;
    return <span>{text}</span>;
  }

  async function setCategoryFor(domain: AdminDomain, value: string) {
    if (value === "__new__") {
      const name = window.prompt("新分类名称");
      if (!name?.trim()) return;
      try {
        await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
        await patch(domain.id, { category: name.trim() }, `已归入新分类 ${name.trim()}`);
      } catch (reason) { notify(reason instanceof Error ? reason.message : "新建分类失败", "error"); }
      return;
    }
    await patch(domain.id, { category: value || null }, value ? "分类已更新" : "已清除分类");
  }

  async function patch(id: number, body: Record<string, unknown>, message: string) {
    try {
      await api(`/api/admin/domains/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      notify(message);
      setRefresh((value) => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); }
  }

  /** 后端单次最多接受 BULK_ID_LIMIT 个 id，超出上限时按批依次提交并累加结果 */
  async function runBulk(action: BulkAction, extra?: { category?: string | null }) {
    const ids = [...selected];
    if (!ids.length) return 0;
    let changed = 0;
    for (const chunk of chunkIds(ids, BULK_ID_LIMIT)) {
      const result = await api<{ changed: number }>("/api/admin/domains/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: chunk, action, ...extra }),
      });
      changed += result.changed;
    }
    setSelected(new Set());
    setRefresh((value) => value + 1);
    return changed;
  }

  async function applyBulkCategory(category: string | null) {
    const changed = await runBulk("categorize", { category });
    notify(category ? `已将 ${changed} 个域名归入「${category}」` : `已清除 ${changed} 个域名的分类`);
  }

  async function applyBulkConfirm(state: BulkConfirmState) {
    const changed = await runBulk(state.action);
    notify(`${state.title}完成，影响 ${changed} 个域名`);
  }

  function exportSelected() {
    if (!selected.size) return;
    void exportCsv(`/api/admin/domains/export?ids=${[...selected].join(",")}`);
  }

  async function exportCsv(url: string) {
    try { await download(url); notify("CSV 已开始下载"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "CSV 导出失败", "error"); }
  }

  async function addDomain() {
    const fullDomain = window.prompt("输入要添加的完整域名");
    if (!fullDomain) return;
    try {
      await api("/api/admin/domains", { method: "POST", body: JSON.stringify({ fullDomain }) });
      notify(`已添加 ${fullDomain}`);
      setRefresh((value) => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "添加失败", "error"); }
  }

  async function removeDomain(domain: AdminDomain) {
    if (!window.confirm(`确认删除 ${domain.full_domain}？此操作不可撤销。`)) return;
    try {
      await api(`/api/admin/domains/${domain.id}`, { method: "DELETE" });
      notify(`已删除 ${domain.full_domain}`);
      setRefresh((value) => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "删除失败", "error"); }
  }

  async function importCsv(file: File) {
    try {
      const dryForm = new FormData(); dryForm.set("file", file); dryForm.set("dryRun", "true");
      const dry = await api<Omit<ImportPreviewData, "file">>("/api/admin/domains/import", { method: "POST", body: dryForm });
      setImportPreview({ file, report: dry.report, preview: dry.preview });
    } catch (reason) { notify(reason instanceof Error ? reason.message : "导入失败", "error"); }
  }

  async function confirmImport(mode: "skip" | "update") {
    if (!importPreview) return;
    const form = new FormData();
    form.set("file", importPreview.file);
    form.set("conflictMode", mode);
    const result = await api<{ imported: number; inserted: number; updated: number; skipped: number; errorCount: number; errorDownloadUrl: string | null }>("/api/admin/domains/import", { method: "POST", body: form });
    notify(`导入完成：新增 ${result.inserted}、更新 ${result.updated}、跳过 ${result.skipped}、错误 ${result.errorCount}`);
    if (result.errorDownloadUrl) await download(result.errorDownloadUrl);
    setImportPreview(null);
    setRefresh((value) => value + 1);
  }

  const allSelected = useMemo(() => items.length > 0 && items.every((domain) => selected.has(domain.id)), [items, selected]);
  const has = (key: string) => columns.has(key);
  return <><Panel title="域名管理" description="前后台共享同一份 D1 数据" actions={<><button className="secondary-button" onClick={() => void exportCsv("/api/admin/domains/export")}>导出全部</button><button className="secondary-button" onClick={() => void exportCsv(`/api/admin/domains/export?q=${encodeURIComponent(q)}&listed=${listed}${tld ? `&tld=${encodeURIComponent(tld)}` : ""}`)}>导出筛选</button><label className="secondary-button file-button">导入 CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }} /></label><button className="primary-button" onClick={() => void addDomain()}>添加域名</button></>}>
    <div className="admin-toolbar">
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索完整域名" />
      <select value={listed} onChange={(event) => setListed(event.target.value)}><option value="">全部展示状态</option><option value="true">前台展示</option><option value="false">已隐藏</option></select>
      <select value={featured} onChange={(event) => setFeatured(event.target.value)}><option value="">全部精品状态</option><option value="true">精品</option><option value="false">非精品</option></select>
      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="分类筛选"><option value="">全部分类</option>{filterOptions.categories.map((item) => <option key={item.name} value={item.name}>{item.name}（{item.count}）</option>)}</select>
      <select value={tld} onChange={(event) => setTld(event.target.value)} aria-label="后缀筛选"><option value="">全部后缀</option>{filterOptions.tlds.map((item) => <option key={item.tld} value={item.tld}>.{item.tld}（{item.count}）</option>)}</select>
      <details className="column-picker"><summary>列显示 ▾</summary><div>{OPTIONAL_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={columns.has(key)} onChange={() => toggleColumn(key)} />{label}</label>)}</div></details>
      <span aria-live="polite">{loading ? "读取中…" : `已加载 ${items.length} / ${total} 个`}</span>
    </div>
    {selected.size > 0 && <div className="bulk-bar"><strong>已选 {selected.size}</strong><button onClick={() => setBulkConfirm({ action: "feature", title: "设为精品", description: "选中域名会标记为精品，并在前台获得独立详情页。", danger: false })}>设为精品</button><button onClick={() => setBulkConfirm({ action: "unfeature", title: "取消精品", description: "选中域名会取消精品标记，独立详情页将不再对外提供。", danger: false })}>取消精品</button><button onClick={() => setBulkConfirm({ action: "list", title: "上架", description: "选中域名会在前台展示。", danger: false })}>上架</button><button onClick={() => setBulkConfirm({ action: "hide", title: "隐藏", description: "选中域名会从前台隐藏，数据仍然保留。", danger: false })}>隐藏</button><button onClick={() => setBulkCategoryOpen(true)}>设置分类</button><button onClick={() => exportSelected()}>导出选中</button><button className="danger-text" onClick={() => setBulkConfirm({ action: "delete", title: "删除", description: "选中域名会被永久删除，此操作不可撤销。", danger: true })}>删除</button><button onClick={() => setSelected(new Set())}>清空选择</button></div>}
    <div className="admin-table-wrap domains-table-wrap"><table className={`admin-table domains-table${virtualEnabled ? " is-virtualized" : ""}`}><thead><tr>
      <th><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((domain) => domain.id)))} aria-label="全选已加载域名" /></th>
      <th className="sortable" onClick={() => toggleSort("domain")}>域名{arrow("domain")}</th>
      {has("expiry") && <th className="sortable" onClick={() => toggleSort("expires_at")}>到期日期{arrow("expires_at")}</th>}
      {has("registrar") && <th>注册商</th>}
      {has("description") && <th>简介</th>}
      {has("category") && <th>分类</th>}
      <th>精品</th><th>前台展示</th><th>操作</th>
    </tr></thead><tbody ref={containerRef}>
      {topPad > 0 ? <tr className="virtual-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: topPad }} /></tr> : null}
      {visibleItems.map((domain) => <tr key={domain.id} data-virtual-row="">
      <td data-label="选择"><input type="checkbox" checked={selected.has(domain.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(domain.id)) next.delete(domain.id); else next.add(domain.id); return next; })} /></td>
      <td data-label="域名"><strong>{domain.full_domain}</strong><small>.{domain.tld}</small></td>
      {has("expiry") && <td data-label="到期日期" className="expiry-cell">{expiryCell(domain)}</td>}
      {has("registrar") && <td data-label="注册商" className="registrar-cell">{domain.registrar_name || <span className="expiry-none">—</span>}</td>}
      {has("description") && <td data-label="简介" className="description-cell"><span>{domain.description}</span><button className="table-link" aria-label={`编辑 ${domain.full_domain} 简介`} onClick={() => setEditing(domain)}>编辑简介</button></td>}
      {has("category") && <td data-label="分类"><small>{domain.category_source === "manual" ? "人工" : "自动"} · {domain.auto_category}/{domain.auto_subcategory}</small><select className="table-link" value={domain.category && manualCategoryNames.has(domain.category) ? domain.category : domain.category ?? ""} onChange={(event) => void setCategoryFor(domain, event.target.value)} aria-label={`${domain.full_domain} 分类`}>
        <option value="">恢复自动（{domain.auto_category}）</option>
        {domain.category && !manualCategoryNames.has(domain.category) && <option value={domain.category}>{domain.category}</option>}
        {manualCategories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        <option value="__new__">＋ 新建分类…</option>
      </select></td>}
      <td data-label="精品"><button className={`switch ${domain.is_featured ? "on gold" : ""}`} aria-label={`${domain.full_domain} 精品状态`} onClick={() => void patch(domain.id, { isFeatured: !domain.is_featured }, domain.is_featured ? "已取消精品" : "已设为精品")}><i /></button></td>
      <td data-label="展示"><button className={`switch ${domain.is_listed ? "on" : ""}`} aria-label={`${domain.full_domain} 展示状态`} onClick={() => void patch(domain.id, { isListed: !domain.is_listed }, domain.is_listed ? "已从前台隐藏" : "已恢复展示")}><i /></button></td>
      <td data-label="操作"><button className="table-link" onClick={() => setEditing(domain)}>编辑</button><button className="table-link danger-text" onClick={() => void removeDomain(domain)}>删除</button></td>
    </tr>)}
      {bottomPad > 0 ? <tr className="virtual-spacer" aria-hidden="true"><td colSpan={columnCount} style={{ height: bottomPad }} /></tr> : null}
    </tbody></table></div>
    {!loading && items.length === 0 ? <div className="empty-inline">没有匹配的域名</div> : null}
    {hasMore
      ? <div ref={sentinelRef} className="infinite-sentinel" aria-live="polite">{loadingMore ? "正在加载更多…" : "向下滚动加载更多"}</div>
      : items.length > 0 && !loading ? <div className="infinite-sentinel is-end">已加载全部 {items.length} 个域名</div> : null}
  </Panel>{editing ? <DomainEditModal domain={editing} notify={notify} onClose={() => setEditing(null)} onSaved={() => setRefresh((value) => value + 1)} /> : null}{bulkCategoryOpen ? <BulkCategoryModal count={selected.size} categories={manualCategories} onClose={() => setBulkCategoryOpen(false)} onConfirm={applyBulkCategory} /> : null}{bulkConfirm ? <BulkConfirmModal state={bulkConfirm} count={selected.size} onClose={() => setBulkConfirm(null)} onConfirm={() => applyBulkConfirm(bulkConfirm)} /> : null}{importPreview ? <ImportPreviewModal data={importPreview} onClose={() => setImportPreview(null)} onConfirm={confirmImport} /> : null}</>;
}

function CategoriesView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState("");
  const [classifying, setClassifying] = useState(false);
  const load = useCallback(() => { api<CategoryRow[]>("/api/admin/categories").then(setCategories).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "分类加载失败", "error")); }, [notify]);
  useEffect(load, [load]);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try { await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); setName(""); notify("分类已创建"); load(); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "创建失败", "error"); }
  }
  async function remove(category: CategoryRow) {
    if (!window.confirm(`删除分类「${category.name}」？其下 ${category.domain_count} 个域名将变为未分类。`)) return;
    try { await api(`/api/admin/categories/${category.id}`, { method: "DELETE" }); notify("分类已删除"); load(); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "删除失败", "error"); }
  }
  async function autoClassify() {
    setClassifying(true);
    try {
      const result = await api<{ domains: number; tags: number }>("/api/admin/categories/auto-classify", { method: "POST" });
      notify(`已扫描 ${result.domains} 个域名，生成 ${result.tags} 个自动分类标签`);
      load();
    } catch (reason) { notify(reason instanceof Error ? reason.message : "自动分类失败", "error"); }
    finally { setClassifying(false); }
  }
  const automatic = categories.filter((category) => category.is_auto);
  const manual = categories.filter((category) => !category.is_auto);
  return <div className="admin-stack"><Panel title="自动分类" description="自动标签只读，不会覆盖人工分类" actions={<button className="primary-button" disabled={classifying} onClick={() => void autoClassify()}>{classifying ? "正在分类…" : "重新自动分类"}</button>}>
    <div className="tag-grid">{automatic.map((category) => <span className="tag-pill tag-auto" key={category.id}>{category.name}<em>{category.domain_count}</em><small>自动</small></span>)}</div>
  </Panel><Panel title="人工分类" description="仅显示管理员创建的分类，避免与自动标签混在同一列表">
    <div className="tag-grid">{manual.length ? manual.map((category) => <span className="tag-pill" key={category.id}>{category.name}<em>{category.domain_count}</em><button onClick={() => void remove(category)} title={`删除 ${category.name}`}>×</button></span>) : <div className="empty-inline">还没有人工分类。</div>}</div>
    <form className="tag-form" onSubmit={(event) => void add(event)}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分类名称" maxLength={80} required /><button className="primary-button">新建分类</button></form>
  </Panel></div>;
}

interface SiteSettingsForm {
  site_name: string; site_description: string; site_bio: string | null; accent_color: string; display_density: "compact" | "comfortable" | "spacious";
  featured_first: number; show_admin_link_in_footer: number; copyright_text: string | null; icp_number: string | null;
  contact_email: string | null; contact_wechat: string | null; contact_telegram: string | null; contact_whatsapp: string | null; contact_x: string | null; contact_xiaohongshu: string | null; contact_qq: string | null;
  logo_url: string | null; favicon_url: string | null; wechat_qr_url: string | null;
}

function SettingsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<SiteSettingsForm | null>(null);
  useEffect(() => { api<SiteSettingsForm>("/api/admin/settings").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取站点设置…</div>;
  function field<K extends keyof SiteSettingsForm>(key: K, value: SiteSettingsForm[K]) { setForm((current) => current ? { ...current, [key]: value } : current); }
  async function save(event: FormEvent) { event.preventDefault(); const current = form; if (!current) return; try { await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ ...current, featured_first: Boolean(current.featured_first), show_admin_link_in_footer: Boolean(current.show_admin_link_in_footer) }) }); notify("站点设置已保存并影响前台"); } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); } }
  async function upload(file: File, target: "logo" | "favicon" | "wechatQr") { const body = new FormData(); body.set("file", file); body.set("target", target); try { const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body }); field(target === "logo" ? "logo_url" : target === "favicon" ? "favicon_url" : "wechat_qr_url", result.url); notify("图片已上传到 R2"); } catch (reason) { notify(reason instanceof Error ? reason.message : "上传失败", "error"); } }
  return <div className="admin-stack"><Panel title="站点设置" description="按品牌、联系方式和展示偏好分区管理"><form className="settings-form settings-sections" onSubmit={(event) => void save(event)}>
    <fieldset><legend>品牌</legend><div className="form-grid"><label>站点名称<input value={form.site_name} onChange={(event) => field("site_name", event.target.value)} /></label><label>主题色<div className="color-field"><input type="color" value={form.accent_color} onChange={(event) => field("accent_color", event.target.value)} /><span>{form.accent_color}</span></div></label><label className="wide">站点 Slogan<input value={form.site_description} onChange={(event) => field("site_description", event.target.value)} /></label><label className="wide">品牌简介<input value={form.site_bio ?? ""} onChange={(event) => field("site_bio", event.target.value || null)} maxLength={500} /></label></div><div className="site-preview" style={{ "--preview-accent": form.accent_color } as CSSProperties}><span>实时预览</span><strong>{form.site_name}</strong><p>{form.site_description}</p></div><div className="upload-grid">{(["logo", "favicon", "wechatQr"] as const).map((target) => { const preview = target === "logo" ? form.logo_url : target === "favicon" ? form.favicon_url : form.wechat_qr_url; return <label className="upload-card" key={target}>{preview ? <img src={preview} alt="" /> : <span>拖拽或选择图片</span>}<strong>{target === "logo" ? "Logo" : target === "favicon" ? "Favicon" : "微信二维码"}</strong><small>PNG / JPEG / WebP，最大 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, target); }} /></label>; })}</div></fieldset>
    <fieldset><legend>联系方式</legend><div className="form-grid"><label>公开邮箱<input type="email" value={form.contact_email ?? ""} onChange={(event) => field("contact_email", event.target.value || null)} /></label><label>微信<input value={form.contact_wechat ?? ""} onChange={(event) => field("contact_wechat", event.target.value || null)} /></label><label>Telegram<input value={form.contact_telegram ?? ""} onChange={(event) => field("contact_telegram", event.target.value || null)} /></label><label>WhatsApp<input value={form.contact_whatsapp ?? ""} onChange={(event) => field("contact_whatsapp", event.target.value || null)} placeholder="国际区号手机号" /></label><label>X<input value={form.contact_x ?? ""} onChange={(event) => field("contact_x", event.target.value || null)} /></label><label>小红书 URL<input value={form.contact_xiaohongshu ?? ""} onChange={(event) => field("contact_xiaohongshu", event.target.value || null)} /></label><label>QQ<input value={form.contact_qq ?? ""} onChange={(event) => field("contact_qq", event.target.value || null)} /></label></div></fieldset>
    <fieldset><legend>展示偏好</legend><div className="form-grid"><label>页面密度<select value={form.display_density} onChange={(event) => field("display_density", event.target.value as SiteSettingsForm["display_density"])}><option value="compact">紧凑</option><option value="comfortable">舒适</option><option value="spacious">宽松</option></select></label><label>ICP备案号<input value={form.icp_number ?? ""} onChange={(event) => field("icp_number", event.target.value || null)} /></label><label>版权文字<input value={form.copyright_text ?? ""} onChange={(event) => field("copyright_text", event.target.value || null)} /></label></div><div className="checkbox-row"><Toggle checked={Boolean(form.featured_first)} label="精品优先" onChange={(checked) => field("featured_first", checked ? 1 : 0)} /><Toggle checked={Boolean(form.show_admin_link_in_footer)} label="页首显示管理入口" onChange={(checked) => field("show_admin_link_in_footer", checked ? 1 : 0)} /></div></fieldset>
    <button className="primary-button align-start">保存全部设置</button>
  </form></Panel></div>;
}

type NotificationChannelKey = "email" | "telegram" | "bark" | "serverchan" | "wecom" | "feishu" | "discord";
interface NotificationChannelForm { channel: NotificationChannelKey; enabled: number; configured: boolean; config: Record<string, string | undefined>; last_test: { ok: boolean; at: string; error: string | null } | null; }
interface NotificationForm { reminder_days_json: string; timezone: string; channels: NotificationChannelForm[]; }
const CHANNEL_LABELS: Record<NotificationChannelKey, string> = { email: "Email · Resend", telegram: "Telegram", bark: "Bark", serverchan: "Server 酱", wecom: "企业微信", feishu: "飞书", discord: "Discord" };

function NotificationsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<NotificationForm | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => { api<NotificationForm>("/api/admin/notifications").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "通知设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取通知设置…</div>;
  const field = (channel: string, key: string, fallback = "") => drafts[channel]?.[key] ?? form.channels.find((item) => item.channel === channel)?.config[key] ?? fallback;
  const change = (channel: string, key: string, value: string) => setDrafts((current) => ({ ...current, [channel]: { ...current[channel], [key]: value } }));
  const reminderDays = (() => { try { const value: unknown = JSON.parse(form.reminder_days_json); return Array.isArray(value) ? value.filter((day): day is number => Number.isInteger(day)) : []; } catch { return []; } })();
  const setReminderDays = (days: number[]) => setForm({ ...form, reminder_days_json: JSON.stringify([...new Set(days)].sort((a, b) => b - a)) });
  async function saveSchedule() { try { await api("/api/admin/notifications", { method: "PATCH", body: JSON.stringify({ reminder_days: reminderDays, timezone: "Asia/Shanghai" }) }); notify("提醒日期已保存"); } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); } }
  async function saveChannel(item: NotificationChannelForm) {
    try {
      await api("/api/admin/notifications/channel", { method: "PATCH", body: JSON.stringify({ channel: item.channel, enabled: Boolean(item.enabled), config: drafts[item.channel] ?? {} }) });
      notify(`${CHANNEL_LABELS[item.channel]} 已保存`);
      setDrafts((current) => ({ ...current, [item.channel]: {} }));
    } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); }
  }
  async function test(channel: NotificationChannelKey) { try { const result = await api<{ last_test: NotificationChannelForm["last_test"] }>("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({ channel }) }); setForm((current) => current ? { ...current, channels: current.channels.map((item) => item.channel === channel ? { ...item, last_test: result.last_test } : item) } : current); notify(`${CHANNEL_LABELS[channel]} 测试发送成功`); } catch (reason) { api<NotificationForm>("/api/admin/notifications").then(setForm).catch(() => undefined); notify(reason instanceof Error ? reason.message : "通知发送失败", "error"); } }
  const setEnabled = (channel: NotificationChannelKey, enabled: boolean) => setForm((current) => current ? { ...current, channels: current.channels.map((item) => item.channel === channel ? { ...item, enabled: enabled ? 1 : 0 } : item) } : current);
  return <Panel title="到期提醒与通知渠道" description="Cloudflare Cron 每天 09:00（Asia/Shanghai）检查；密钥/Webhook 一律 AES-GCM 加密存储">
    <div className="notification-stack">
      <div className="reminder-editor"><div><strong>到期前提醒</strong><small>按天设置，可自由增删</small></div><div className="reminder-chips">{reminderDays.map((day) => <button key={day} onClick={() => setReminderDays(reminderDays.filter((value) => value !== day))}>{day} 天 ×</button>)}<button className="add-chip" onClick={() => { const value = Number(window.prompt("输入提前提醒天数", "60")); if (Number.isInteger(value) && value > 0 && value <= 365) setReminderDays([...reminderDays, value]); }}>＋ 添加</button></div><button className="secondary-button" onClick={() => void saveSchedule()}>保存提醒日期</button></div>
      <ExpiryCalendar />
      {form.channels.map((item) => <div className="channel-card" key={item.channel}>
        <Toggle checked={Boolean(item.enabled)} label={CHANNEL_LABELS[item.channel]} onChange={(checked) => setEnabled(item.channel, checked)} />
        {item.channel === "bark" && <><input value={field(item.channel, "server_url", "https://api.day.app")} onChange={(event) => change(item.channel, "server_url", event.target.value)} placeholder="https://api.day.app" /><input type="password" value={field(item.channel, "device_key")} onChange={(event) => change(item.channel, "device_key", event.target.value)} placeholder={item.configured ? "Device Key 已加密；留空不修改" : "Device Key"} /></>}
        {item.channel === "telegram" && <><input type="password" value={field(item.channel, "bot_token")} onChange={(event) => change(item.channel, "bot_token", event.target.value)} placeholder={item.configured ? "Bot Token 已加密；留空不修改" : "Bot Token"} /><input value={field(item.channel, "chat_id")} onChange={(event) => change(item.channel, "chat_id", event.target.value)} placeholder="Chat ID" /></>}
        {item.channel === "serverchan" && <input type="password" value={field(item.channel, "send_key")} onChange={(event) => change(item.channel, "send_key", event.target.value)} placeholder={item.configured ? "SendKey 已加密；留空不修改" : "SendKey"} />}
        {(["wecom", "feishu", "discord"] as string[]).includes(item.channel) && <input type="password" value={field(item.channel, "webhook_url")} onChange={(event) => change(item.channel, "webhook_url", event.target.value)} placeholder={item.configured ? "Webhook 已加密；留空不修改" : "Webhook URL"} />}
        {item.channel === "email" && <><input type="email" value={field(item.channel, "from")} onChange={(event) => change(item.channel, "from", event.target.value)} placeholder="发件邮箱" /><input type="email" value={field(item.channel, "to")} onChange={(event) => change(item.channel, "to", event.target.value)} placeholder="收件邮箱" /></>}
        <div className={`test-badge ${item.last_test?.ok ? "ok" : item.last_test ? "failed" : ""}`}>{item.last_test ? `${item.last_test.ok ? "最近测试成功" : "最近测试失败"} · ${new Date(item.last_test.at).toLocaleString("zh-CN")}${item.last_test.error ? ` · ${item.last_test.error}` : ""}` : "尚未测试"}</div>
        <button type="button" onClick={() => void saveChannel(item)}>保存</button><button type="button" onClick={() => void test(item.channel)}>发送真实测试</button>
      </div>)}
    </div>
  </Panel>;
}

function SecurityView({ user, notify }: { user: AdminUser; notify: (text: string, tone?: "success" | "error") => void }) {
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const passwordStrength = Math.min(4, [newPassword.length >= 12, /[A-Z]/.test(newPassword), /\d/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword)].filter(Boolean).length);
  async function changePassword(event: FormEvent) { event.preventDefault(); try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(""); setNewPassword(""); notify("密码已修改，其他旧会话已失效"); } catch (reason) { notify(reason instanceof Error ? reason.message : "修改失败", "error"); } }
  return <div className="admin-stack"><Panel title="账户安全" description={`当前管理员：${user.email}`}><form className="security-form" onSubmit={(event) => void changePassword(event)}><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>新密码<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 12 位" /><span className="password-strength" aria-label={`密码强度 ${passwordStrength}/4`}>{[1, 2, 3, 4].map((level) => <i key={level} className={level <= passwordStrength ? "active" : ""} />)}</span></label><button className="primary-button">修改密码</button></form></Panel></div>;
}

interface LogPage {
  items: Array<{
    id: number;
    level: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    actor_email: string;
    message: string;
    success: number;
    created_at: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const LOG_ACTIONS: Array<[string, string]> = [
  ["auth.login", "管理员登录"],
  ["domains.create", "创建域名"],
  ["domains.update", "修改域名"],
  ["domains.delete", "删除域名"],
  ["domains.import", "CSV 导入"],
  ["domains.export", "CSV 导出"],
  ["domains.bulk.feature", "批量设为精品"],
  ["domains.bulk.unfeature", "批量取消精品"],
  ["domains.bulk.categorize", "批量设置分类"],
  ["domains.bulk.price", "批量更新"],
  ["domains.bulk.delete", "批量删除"],
  ["ai.config.create", "新增 AI 配置"],
  ["ai.config.update", "更新 AI 配置"],
  ["ai.config.test", "测试 AI 配置"],
  ["ai.config.activate", "启用 AI 配置"],
  ["ai.config.delete", "删除 AI 配置"],
  ["settings.update", "系统设置"],
];

interface LogTrendData {
  days: Array<{ day: string; label: string; total: number } & Record<LogActionGroup, number>>;
  groups: Record<LogActionGroup, number>;
}

function LogsTrendPanel() {
  const [trend, setTrend] = useState<LogTrendData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<LogTrendData>("/api/admin/logs/trend").then(setTrend).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  if (!trend) return <div className="state-panel">正在读取操作趋势…</div>;
  const total = trend.days.reduce((sum, point) => sum + point.total, 0);
  return <div className="log-trend">
    <div className="log-trend-groups">
      <div className="log-trend-total"><span>近 7 天操作</span><strong>{total}</strong></div>
      {(Object.keys(LOG_GROUP_LABELS) as LogActionGroup[]).map((group) => <div key={group}><span>{LOG_GROUP_LABELS[group]}</span><strong>{trend.groups[group]}</strong></div>)}
    </div>
    <div className="log-trend-chart">
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={trend.days} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
          <Tooltip />
          <Line type="monotone" dataKey="total" name="操作数" stroke="var(--brand)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

function LogsView() {
  const [data, setData] = useState<LogPage | null>(null);
  const [level, setLevel] = useState("");
  const [action, setAction] = useState("");
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const params = useCallback(() => {
    const search = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (level) search.set("level", level);
    if (action) search.set("action", action);
    if (keyword.trim()) search.set("q", keyword.trim());
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return search;
  }, [action, from, keyword, level, page, to]);
  useEffect(() => { void api<LogPage>(`/api/admin/logs?${params()}`).then(setData).catch(() => setData({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 })); }, [params]);
  return <Panel title="操作日志" description="日志来自 D1，不记录密码、Token 或完整凭据；90 天前的日志由 Cron 自动清理" actions={<button className="secondary-button" onClick={() => void download(`/api/admin/logs/export?${params()}`)}>导出 CSV</button>}>
    <LogsTrendPanel />
    <div className="log-filter">
      <select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }} aria-label="级别筛选"><option value="">全部级别</option><option value="info">信息</option><option value="warning">警告</option><option value="error">错误</option></select>
      <select value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} aria-label="操作类型筛选"><option value="">全部操作类型</option>{LOG_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="消息、动作、对象或操作者" aria-label="日志关键字" />
      <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="开始日期" />
      <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="结束日期" />
      <span>共 {data?.total ?? 0} 条</span>
    </div>
    {data ? (data.items.length ? <ol className="activity-timeline">{data.items.map((log) => {
      const dangerous = !log.success || log.action.includes("delete") || log.action.includes("revoke");
      return <li className={dangerous ? "is-danger" : ""} key={log.id}>
        <span className="timeline-marker" aria-hidden="true"><i /></span>
        <article><header><strong>{LOG_ACTIONS.find(([value]) => value === log.action)?.[1] ?? log.action}</strong><time title={formatExact(log.created_at)}>{new Date(log.created_at).toLocaleString("zh-CN")}</time></header><p>{log.message}</p><footer><span>{log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ""}</span><span>{log.actor_email}</span><span className={log.success ? "log-result success" : "log-result error"}>{log.success ? "成功" : "失败"}</span></footer></article>
      </li>;
    })}</ol> : <div className="empty-inline">没有匹配的日志</div>) : <div className="empty-inline">正在读取日志…</div>}
    {data && data.totalPages > 1 && <div className="pagination admin-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {data.page} / {data.totalPages} 页</span><button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
  </Panel>;
}

export function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null); const [checking, setChecking] = useState(true); const [view, setView] = useState<AdminView>("overview"); const [toast, setToast] = useState<ToastMessage | null>(null);
  const [domainsPresetTld, setDomainsPresetTld] = useState<string | undefined>(undefined);
  const [branding, setBranding] = useState<{ site_name: string; logo_url: string | null } | null>(null);
  const notify = useCallback((text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone }), []);
  useEffect(() => { api<AdminUser>("/api/auth/me").then(setUser).catch((reason: unknown) => { if (!(reason instanceof ApiError) || reason.status !== 401) notify(reason instanceof Error ? reason.message : "会话检查失败", "error"); }).finally(() => setChecking(false)); }, [notify]);
  useEffect(() => { api<{ site_name: string; logo_url: string | null }>("/api/public/settings").then(setBranding).catch(() => undefined); }, []);
  if (checking) return <div className="app-loading"><img className="brand-mark-img" src="/logo.svg" alt="" /><p>正在验证 DOMAIN HUNTER 会话…</p></div>;
  if (!user) return <LoginPage onLogin={(loggedIn) => { setUser(loggedIn); setView("overview"); }} />;
  const nav: Array<[AdminView, string, LucideIcon]> = [["overview", "概览", LayoutDashboard], ["domains", "域名管理", Globe], ["categories", "分类", Tag], ["settings", "站点设置", Settings], ["notifications", "到期提醒", Bell], ["security", "账户安全", ShieldCheck], ["logs", "操作日志", History]];
  async function logout() { try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); } }
  return <div className="admin-shell"><aside className="admin-sidebar"><a href="/" className="brand admin-brand">{branding?.logo_url ? <img className="brand-icon" src={branding.logo_url} alt="" decoding="async" /> : <img className="brand-mark-img" src="/logo.svg" alt="" decoding="async" />}<span>{branding?.site_name ?? "DOMAIN HUNTER"}</span></a><nav>{nav.map(([key, label, Icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon aria-hidden="true" />{label}</button>)}</nav><details className="sidebar-user"><summary><span className="user-avatar">{user.email.slice(0, 1).toUpperCase()}</span><span><strong>{user.email}</strong><small>管理员</small></span><ChevronDown aria-hidden="true" /></summary><div className="user-menu"><button onClick={() => setView("security")}><ShieldCheck aria-hidden="true" />修改密码</button><button onClick={() => void logout()}><LogOut aria-hidden="true" />退出登录</button></div></details></aside><div className="admin-main"><header className="admin-header"><div><span>DOMAIN HUNTER 管理后台</span><h1>{nav.find(([key]) => key === view)?.[1]}</h1></div><div className="admin-header-actions"><a className="admin-frontend-link" href="/" target="_blank" rel="noopener noreferrer" aria-label="查看前台" title="查看前台"><ExternalLink aria-hidden="true" /></a></div></header><main>{view === "overview" && <OverviewView onTldClick={(tld) => { setDomainsPresetTld(tld); setView("domains"); }} onNavigate={setView} notify={notify} />}{view === "domains" &&<DomainsView key={domainsPresetTld ?? "all"} notify={notify} presetTld={domainsPresetTld} />}{view === "categories" && <CategoriesView notify={notify} />}{view === "settings" && <SettingsView notify={notify} />}{view === "notifications" && <NotificationsView notify={notify} />}{view === "security" && <SecurityView user={user} notify={notify} />}{view === "logs" && <LogsView />}</main></div><Toast message={toast} onClose={() => setToast(null)} /></div>;
}
