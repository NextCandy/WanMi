import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { ApiError, api, download } from "../../lib/api";

type AdminView = "overview" | "domains" | "categories" | "leads" | "dns" | "registrars" | "settings" | "notifications" | "security" | "logs";

const STATUS_TIPS: Record<string, string> = {
  Listed: "已在市场正常挂牌，可被买家搜索到",
  "Failed Compliance": "未通过市场合规审核，需在注册商侧处理后重新提交",
  "Ownership Review": "市场正在验证域名所有权，期间不可交易",
  "TLD Not Eligible": "该后缀不被市场支持，无法挂牌",
  "Pending Verification": "等待验证，完成后自动挂牌",
};

interface AdminUser {
  id: number;
  email: string;
  sessionId: string;
}

interface DashboardData {
  counts: { total: number; listed: number; hidden: number; featured: number };
  kpis: { totalViews: number; marketLeads: number; siteLeads: number; newSiteLeads: number };
  topViews: Array<{ full_domain: string; views: number }>;
  expiring90d: Array<{ full_domain: string; expires_at: string }>;
  tlds: Array<{ tld: string; count: number }>;
  listingStatuses: Array<{ status: string; count: number }>;
  recentImports: Array<Record<string, unknown>>;
  recentSyncs: Array<Record<string, unknown>>;
  recentLogs: Array<{ id: number; level: string; action: string; message: string; success: number; created_at: string }>;
  registrarCount: number;
  hasExpirationData: boolean;
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
  listing_status: string | null;
  fast_transfer: string | null;
  date_added_at: string | null;
  views: number | null;
  leads: number | null;
  godaddy_ns: string | null;
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
        <a href="/" className="brand login-brand"><span className="brand-mark">玩</span><span>玩米</span></a>
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

function OverviewView({ onTldClick }: { onTldClick: (tld: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<DashboardData>("/api/admin/dashboard").then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "概览加载失败"));
  }, []);
  if (error) return <div className="state-panel error-panel">{error}</div>;
  if (!data) return <div className="state-panel">正在读取真实统计…</div>;
  const cards = [
    ["域名总数", data.counts.total], ["前台展示", data.counts.listed], ["已隐藏", data.counts.hidden], ["精品域名", data.counts.featured],
  ];
  const kpiCards: Array<[string, string, string]> = [
    ["累计 Views", data.kpis.totalViews.toLocaleString("en-US"), "市场浏览量"],
    ["求购线索", `${data.kpis.siteLeads}`, `${data.kpis.newSiteLeads} 条未读 · 市场 ${data.kpis.marketLeads}`],
  ];
  return <div className="admin-stack">
    <div className="stat-grid">{cards.map(([label, value]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="stat-grid">{kpiCards.map(([label, value, hint]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
    <div className="admin-two-columns">
      <Panel title="后缀分布" description="点击跳转到筛选后的域名管理"><div className="distribution-list">{data.tlds.slice(0, 12).map((item) => <a key={item.tld} onClick={() => onTldClick(item.tld)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onTldClick(item.tld); }}><span>.{item.tld}</span><div className="bar"><i style={{ width: `${Math.max(4, item.count / Math.max(data.counts.total, 1) * 100)}%` }} /></div><strong>{item.count}</strong></a>)}</div></Panel>
      <Panel title="市场状态" description="CSV 市场数据，不决定前台展示"><div className="status-list">{data.listingStatuses.map((item) => <div key={item.status} title={STATUS_TIPS[item.status] ?? ""}><span>{item.status}</span><strong>{item.count}</strong></div>)}</div></Panel>
    </div>
    <div className="admin-two-columns">
      <Panel title="热门域名（Views Top 5）"><div className="kpi-list">{data.topViews.length ? data.topViews.map((item) => <div key={item.full_domain}><span className="mono">{item.full_domain}</span><b>{item.views}</b></div>) : <div className="empty-inline">暂无浏览数据</div>}</div></Panel>
      <Panel title="90 天内到期"><div className="kpi-list">{data.expiring90d.length ? data.expiring90d.map((item) => <div key={item.full_domain}><span className="mono">{item.full_domain}</span><b>{new Date(item.expires_at).toLocaleDateString("zh-CN")}</b></div>) : <div className="empty-inline">暂无 90 天内到期的域名（或尚无到期数据）</div>}</div></Panel>
    </div>
    <div className="admin-two-columns">
      <Panel title="最近操作"><div className="activity-list">{data.recentLogs.length ? data.recentLogs.map((log) => <div key={log.id}><span className={log.success ? "dot-success" : "dot-error"} /><div><strong>{log.message}</strong><small>{new Date(log.created_at).toLocaleString("zh-CN")}</small></div></div>) : <div className="empty-inline">暂无操作记录</div>}</div></Panel>
      <Panel title="基础设施状态"><div className="infra-list"><div><span>D1 域名数据库</span><strong className="status-ok">已连接</strong></div><div><span>注册商账户</span><strong>{data.registrarCount}</strong></div><div><span>到期数据</span><strong>{data.hasExpirationData ? "已同步" : "暂无到期数据"}</strong></div></div></Panel>
    </div>
  </div>;
}

type DomainOrderBy = "domain" | "views" | "leads" | "date_added";
const OPTIONAL_COLUMNS: Array<[string, string]> = [
  ["category", "分类"], ["status", "市场状态"],
  ["views", "Views"], ["leads", "Leads"], ["date_added", "Date Added"], ["ns", "NS"],
];
const DEFAULT_COLUMNS = ["category", "status"];

function loadColumns(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem("wanmi-admin-columns") ?? "null") as string[] | null;
    if (Array.isArray(stored)) return new Set(stored.filter((key) => OPTIONAL_COLUMNS.some(([k]) => k === key)));
  } catch { /* 使用默认列 */ }
  return new Set(DEFAULT_COLUMNS);
}

interface CategoryRow { id: number; name: string; domain_count: number }

function DomainsView({ notify, presetTld }: { notify: (text: string, tone?: "success" | "error") => void; presetTld?: string }) {
  const [data, setData] = useState<AdminDomainPage | null>(null);
  const [q, setQ] = useState("");
  const [listed, setListed] = useState("");
  const [tld, setTld] = useState(presetTld ?? "");
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState<DomainOrderBy | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [columns, setColumns] = useState<Set<string>>(loadColumns);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (q) params.set("q", q);
    if (listed) params.set("listed", listed);
    if (tld) params.set("tld", tld);
    if (orderBy) { params.set("orderBy", orderBy); params.set("dir", dir); }
    setLoading(true);
    api<AdminDomainPage>(`/api/admin/domains?${params}`)
      .then(setData)
      .catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "域名加载失败", "error"))
      .finally(() => setLoading(false));
  }, [dir, listed, notify, orderBy, page, q, tld]);
  useEffect(load, [load, refresh]);
  useEffect(() => { api<CategoryRow[]>("/api/admin/categories").then(setCategories).catch(() => setCategories([])); }, [refresh]);

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
    else { setOrderBy(key); setDir(key === "domain" ? "asc" : "desc"); }
    setPage(1);
  }
  const arrow = (key: DomainOrderBy) => orderBy === key ? <span className="sort-arrow">{dir === "asc" ? "↑" : "↓"}</span> : null;

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

  async function bulk(action: string) {
    if (!selected.size) return;
    if (action === "delete" && !window.confirm(`确认删除所选 ${selected.size} 个真实域名？此操作不可撤销。`)) return;
    let category: string | null | undefined;
    if (action === "categorize") category = window.prompt("输入新分类；留空将清除分类") ?? undefined;
    if (action === "categorize" && category === undefined) return;
    try {
      const result = await api<{ changed: number }>("/api/admin/domains/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], action, category }) });
      notify(`已更新 ${result.changed} 个域名`);
      setSelected(new Set());
      setRefresh((value) => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "批量操作失败", "error"); }
  }

  function exportSelected() {
    if (!selected.size) return;
    void exportCsv(`/api/admin/domains/export?ids=${[...selected].join(",")}`);
  }

  async function exportCsv(url: string) {
    try { await download(url); notify("CSV 已开始下载"); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "CSV 导出失败", "error"); }
  }

  async function bulkDns() {
    if (!selected.size) return;
    const type = window.prompt("记录类型：A / AAAA / CNAME / MX / TXT / NS / CAA / SRV", "A");
    if (!type) return;
    const name = window.prompt("主机记录", "@"); if (name === null) return;
    const content = window.prompt("记录值"); if (!content) return;
    try {
      const result = await api<{ successes: number; failures: number; results: Array<{ domain?: string; success: boolean; error?: string }> }>("/api/admin/dns/bulk", { method: "POST", body: JSON.stringify({ domainIds: [...selected], record: { type: type.toUpperCase(), name: name || "@", content, ttl: 600 } }) });
      notify(`批量 DNS：成功 ${result.successes}，失败 ${result.failures}`, result.failures ? "error" : "success");
      if (result.failures) window.alert(result.results.filter((item) => !item.success).map((item) => `${item.domain ?? "未知域名"}：${item.error}`).join("\n"));
    } catch (reason) { notify(reason instanceof Error ? reason.message : "批量 DNS 失败", "error"); }
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

  async function importCsv(file: File) {
    try {
      const dryForm = new FormData(); dryForm.set("file", file); dryForm.set("dryRun", "true");
      const dry = await api<{ report: { parsedCount: number; invalidCount: number; duplicateCount: number } }>("/api/admin/domains/import", { method: "POST", body: dryForm });
      if (!window.confirm(`解析 ${dry.report.parsedCount} 条；无效 ${dry.report.invalidCount}；重复 ${dry.report.duplicateCount}。继续导入合法记录？`)) return;
      const form = new FormData(); form.set("file", file);
      const result = await api<{ imported: number; errorCount: number; errorDownloadUrl: string | null }>("/api/admin/domains/import", { method: "POST", body: form });
      notify(`已导入/更新 ${result.imported} 条，错误 ${result.errorCount} 条`);
      if (result.errorDownloadUrl) await download(result.errorDownloadUrl);
      setRefresh((value) => value + 1);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "导入失败", "error"); }
  }

  const allSelected = Boolean(data?.items.length) && data!.items.every((domain) => selected.has(domain.id));
  const has = (key: string) => columns.has(key);
  return <Panel title="域名管理" description="前后台共享同一份 D1 数据" actions={<><button className="secondary-button" onClick={() => void exportCsv(`/api/admin/domains/export?q=${encodeURIComponent(q)}&listed=${listed}${tld ? `&tld=${encodeURIComponent(tld)}` : ""}`)}>导出 CSV</button><label className="secondary-button file-button">导入 CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }} /></label><button className="primary-button" onClick={() => void addDomain()}>添加域名</button></>}>
    <div className="admin-toolbar">
      <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="搜索完整域名" />
      <select value={listed} onChange={(event) => { setListed(event.target.value); setPage(1); }}><option value="">全部展示状态</option><option value="true">前台展示</option><option value="false">已隐藏</option></select>
      {tld && <button className="table-link" onClick={() => { setTld(""); setPage(1); }}>后缀 .{tld} ×</button>}
      <details className="column-picker"><summary>列显示 ▾</summary><div>{OPTIONAL_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={columns.has(key)} onChange={() => toggleColumn(key)} />{label}</label>)}</div></details>
      <span>{loading ? "读取中…" : `共 ${data?.total ?? 0} 个`}</span>
    </div>
    {selected.size > 0 && <div className="bulk-bar"><strong>已选 {selected.size}</strong><button onClick={() => void bulk("feature")}>设为精品</button><button onClick={() => void bulk("unfeature")}>取消精品</button><button onClick={() => void bulk("list")}>上架</button><button onClick={() => void bulk("hide")}>隐藏</button><button onClick={() => void bulk("categorize")}>设置分类</button><button onClick={() => exportSelected()}>导出选中</button><button onClick={() => void bulkDns()}>批量 DNS</button><button className="danger-text" onClick={() => void bulk("delete")}>删除</button><button onClick={() => setSelected(new Set())}>清空选择</button></div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
      <th><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(data?.items.map((domain) => domain.id)))} aria-label="全选当前页" /></th>
      <th className="sortable" onClick={() => toggleSort("domain")}>域名{arrow("domain")}</th>
      {has("category") && <th>分类</th>}
      {has("status") && <th>市场状态</th>}
      {has("views") && <th className="sortable" onClick={() => toggleSort("views")}>Views{arrow("views")}</th>}
      {has("leads") && <th className="sortable" onClick={() => toggleSort("leads")}>Leads{arrow("leads")}</th>}
      {has("date_added") && <th className="sortable" onClick={() => toggleSort("date_added")}>Date Added{arrow("date_added")}</th>}
      {has("ns") && <th>NS</th>}
      <th>精品</th><th>前台展示</th><th>操作</th>
    </tr></thead><tbody>{data?.items.map((domain) => <tr key={domain.id}>
      <td><input type="checkbox" checked={selected.has(domain.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(domain.id)) next.delete(domain.id); else next.add(domain.id); return next; })} /></td>
      <td><strong>{domain.full_domain}</strong><small>{domain.fast_transfer || "无 Fast Transfer 数据"}</small></td>
      {has("category") && <td><select className="table-link" value={domain.category && categories.some((item) => item.name === domain.category) ? domain.category : domain.category ?? ""} onChange={(event) => void setCategoryFor(domain, event.target.value)} aria-label={`${domain.full_domain} 分类`}>
        <option value="">未分类</option>
        {domain.category && !categories.some((item) => item.name === domain.category) && <option value={domain.category}>{domain.category}</option>}
        {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        <option value="__new__">＋ 新建分类…</option>
      </select></td>}
      {has("status") && <td title={STATUS_TIPS[domain.listing_status ?? ""] ?? ""}>{domain.listing_status ? <span className={`badge-status ${domain.listing_status === "Listed" ? "badge-listed" : domain.listing_status === "Failed Compliance" ? "badge-danger" : "badge-warning"}`}>{domain.listing_status}</span> : "—"}</td>}
      {has("views") && <td>{domain.views ?? "—"}</td>}
      {has("leads") && <td>{domain.leads ?? "—"}</td>}
      {has("date_added") && <td>{domain.date_added_at ? new Date(domain.date_added_at).toLocaleDateString("zh-CN") : "—"}</td>}
      {has("ns") && <td>{domain.godaddy_ns || "—"}</td>}
      <td><button className={`switch ${domain.is_featured ? "on gold" : ""}`} onClick={() => void patch(domain.id, { isFeatured: !domain.is_featured }, domain.is_featured ? "已取消精品" : "已设为精品")}><i /></button></td>
      <td><button className={`switch ${domain.is_listed ? "on" : ""}`} onClick={() => void patch(domain.id, { isListed: !domain.is_listed }, domain.is_listed ? "已从前台隐藏" : "已恢复展示")}><i /></button></td>
      <td><details className="row-details"><summary>详情</summary><div><span>Views：{domain.views ?? "—"}</span><span>Leads：{domain.leads ?? "—"}</span><span>Date Added：{domain.date_added_at ?? "—"}</span><span>GoDaddy NS：{domain.godaddy_ns ?? "—"}</span></div></details></td>
    </tr>)}</tbody></table></div>
    {data && data.totalPages > 1 && <div className="pagination admin-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {data.totalPages} 页</span><button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
  </Panel>;
}

function CategoriesView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState("");
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
  return <Panel title="分类管理" description="分类作为标签作用于域名，删除分类会将关联域名置为未分类">
    <div className="tag-grid">{categories.length ? categories.map((category) => <span className="tag-pill" key={category.id}>{category.name}<em>{category.domain_count}</em><button onClick={() => void remove(category)} title={`删除 ${category.name}`}>×</button></span>) : <div className="empty-inline">还没有分类，先创建一个。</div>}</div>
    <form className="tag-form" onSubmit={(event) => void add(event)}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分类名称" maxLength={80} required /><button className="primary-button">新建分类</button></form>
  </Panel>;
}

interface LeadRow { id: number; full_domain: string; contact: string; message: string | null; country: string | null; status: "new" | "read" | "archived"; created_at: string }
function LeadsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [data, setData] = useState<{ items: LeadRow[]; total: number; totalPages: number } | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (status) params.set("status", status);
    api<{ items: LeadRow[]; total: number; totalPages: number }>(`/api/admin/leads?${params}`).then(setData).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "线索加载失败", "error"));
  }, [notify, page, status]);
  useEffect(load, [load]);
  async function setLeadStatus(lead: LeadRow, next: LeadRow["status"]) {
    try { await api(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }); load(); }
    catch (reason) { notify(reason instanceof Error ? reason.message : "更新失败", "error"); }
  }
  return <Panel title="求购线索" description="来自前台求购意向表单，提交时已触发通知渠道">
    <div className="admin-toolbar"><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="new">未读</option><option value="read">已读</option><option value="archived">已归档</option></select><span>共 {data?.total ?? 0} 条</span></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th><th>域名</th><th>联系方式</th><th>留言</th><th>地区</th><th>状态</th><th>操作</th></tr></thead><tbody>
      {data?.items.map((lead) => <tr key={lead.id}>
        <td>{new Date(lead.created_at).toLocaleString("zh-CN")}</td>
        <td><strong>{lead.full_domain}</strong></td>
        <td>{lead.contact}</td>
        <td style={{ maxWidth: 220, wordBreak: "break-all" }}>{lead.message || "—"}</td>
        <td>{lead.country ?? "—"}</td>
        <td><span className={`lead-status lead-${lead.status}`}>{lead.status === "new" ? "未读" : lead.status === "read" ? "已读" : "已归档"}</span></td>
        <td>{lead.status === "new" && <button className="table-link" onClick={() => void setLeadStatus(lead, "read")}>标为已读</button>}{lead.status !== "archived" && <button className="table-link" onClick={() => void setLeadStatus(lead, "archived")}>归档</button>}</td>
      </tr>)}
    </tbody></table></div>
    {data && data.items.length === 0 && <div className="empty-inline">暂无求购线索</div>}
    {data && data.totalPages > 1 && <div className="pagination admin-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {data.totalPages} 页</span><button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
  </Panel>;
}

interface RegistrarAccount { id: number; provider: string; display_name: string; status: string; last_tested_at: string | null; last_synced_at: string | null; last_error: string | null; }
const providerFields: Record<string, Array<[string, string]>> = {
  cloudflare: [["apiToken", "API Token"], ["accountId", "Account ID（可选）"]],
  godaddy: [["apiKey", "API Key"], ["apiSecret", "API Secret"]],
  namesilo: [["apiKey", "API Key"]],
  porkbun: [["apiKey", "API Key"], ["secretApiKey", "Secret API Key"]],
  dnspod: [["secretId", "Secret ID"], ["secretKey", "Secret Key"]],
  aliyun: [["accessKeyId", "AccessKey ID"], ["accessKeySecret", "AccessKey Secret"]],
};

function RegistrarsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [accounts, setAccounts] = useState<RegistrarAccount[]>([]); const [provider, setProvider] = useState("cloudflare"); const [displayName, setDisplayName] = useState(""); const [credentials, setCredentials] = useState<Record<string, string>>({});
  const load = useCallback(() => { api<RegistrarAccount[]>("/api/admin/registrars").then(setAccounts).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "账户加载失败", "error")); }, [notify]); useEffect(load, [load]);
  async function add(event: FormEvent) { event.preventDefault(); try { await api("/api/admin/registrars", { method: "POST", body: JSON.stringify({ provider, displayName, credentials }) }); setDisplayName(""); setCredentials({}); notify("注册商账户已加密保存，请执行连接测试"); load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "添加失败", "error"); } }
  async function action(id: number, type: "test" | "sync") { try { const result = await api<Record<string, unknown>>(`/api/admin/registrars/${id}/${type}`, { method: "POST" }); notify(type === "test" ? "真实连接测试通过" : `真实同步完成：${JSON.stringify(result)}`); load(); } catch (reason) { notify(reason instanceof Error ? reason.message : `${type} 失败`, "error"); load(); } }
  return <div className="admin-stack"><Panel title="注册商账户" description="凭据使用 AES-GCM 加密；测试和同步会调用真实官方 API"><div className="registrar-grid">{accounts.length ? accounts.map((account) => <div className="registrar-card" key={account.id}><div><span className={`provider-logo provider-${account.provider}`}>{account.provider.slice(0, 2).toUpperCase()}</span><div><strong>{account.display_name}</strong><small>{account.provider}</small></div><em className={`account-status status-${account.status}`}>{account.status}</em></div><p>{account.last_error || (account.last_synced_at ? `上次同步 ${new Date(account.last_synced_at).toLocaleString("zh-CN")}` : "尚未同步")}</p><div><button onClick={() => void action(account.id, "test")}>测试连接</button><button onClick={() => void action(account.id, "sync")}>立即同步</button><button className="danger-text" onClick={() => { if (window.confirm("确认删除该注册商账户？")) void api(`/api/admin/registrars/${account.id}`, { method: "DELETE" }).then(() => { notify("账户已删除"); load(); }); }}>删除</button></div></div>) : <div className="state-panel small-state">尚未添加真实注册商账户</div>}</div></Panel><Panel title="添加账户" description="请使用最小权限 API 凭据；保存后不会回显完整密钥"><form className="registrar-form" onSubmit={(event) => void add(event)}><label>服务商<select value={provider} onChange={(event) => { setProvider(event.target.value); setCredentials({}); }}><option value="cloudflare">Cloudflare</option><option value="godaddy">GoDaddy</option><option value="namesilo">NameSilo</option><option value="porkbun">Porkbun</option><option value="dnspod">DNSPod</option><option value="aliyun">阿里云</option></select></label><label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>{providerFields[provider].map(([key, label]) => <label key={key}>{label}<input type={key.toLowerCase().includes("secret") || key.toLowerCase().includes("token") || key === "apiKey" ? "password" : "text"} value={credentials[key] ?? ""} onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))} required={!label.includes("可选")} autoComplete="off" /></label>)}<button className="primary-button">加密保存</button></form></Panel></div>;
}

interface DnsRecordView { id: string; type: string; name: string; content: string; ttl: number | null; priority: number | null; proxied: boolean | null; }

interface TemplateRecord { type: string; name: string; content: string; ttl: number; priority?: number | null; proxied?: boolean | null }
interface DnsTemplate {
  key: string;
  label: string;
  variable?: { prompt: string; example: string };
  build: (domain: string, variable: string) => TemplateRecord[];
}
const DNS_TEMPLATES: DnsTemplate[] = [
  {
    key: "cloudflare-proxy", label: "Cloudflare Proxy（A + www）",
    variable: { prompt: "源站服务器 IP", example: "203.0.113.10" },
    build: (domain, ip) => [
      { type: "A", name: "@", content: ip, ttl: 300, proxied: true },
      { type: "CNAME", name: "www", content: domain, ttl: 300, proxied: true },
    ],
  },
  {
    key: "vercel", label: "Vercel",
    build: () => [
      { type: "A", name: "@", content: "76.76.21.21", ttl: 300 },
      { type: "CNAME", name: "www", content: "cname.vercel-dns.com", ttl: 300 },
    ],
  },
  {
    key: "github-pages", label: "GitHub Pages",
    variable: { prompt: "GitHub 用户名", example: "octocat" },
    build: (domain, username) => [
      { type: "A", name: "@", content: "185.199.108.153", ttl: 3600 },
      { type: "A", name: "@", content: "185.199.109.153", ttl: 3600 },
      { type: "A", name: "@", content: "185.199.110.153", ttl: 3600 },
      { type: "A", name: "@", content: "185.199.111.153", ttl: 3600 },
      { type: "CNAME", name: "www", content: `${username}.github.io`, ttl: 3600 },
    ],
  },
  {
    key: "tencent-mx", label: "腾讯企业邮箱 MX",
    build: () => [
      { type: "MX", name: "@", content: "mxbiz1.qq.com", ttl: 3600, priority: 5 },
      { type: "MX", name: "@", content: "mxbiz2.qq.com", ttl: 3600, priority: 10 },
    ],
  },
];

interface DiffPlanItem extends TemplateRecord { conflict: DnsRecordView | null }

function DnsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [query, setQuery] = useState(""); const [domain, setDomain] = useState<AdminDomain | null>(null); const [records, setRecords] = useState<DnsRecordView[]>([]); const [loading, setLoading] = useState(false); const [record, setRecord] = useState({ type: "A", name: "@", content: "", ttl: 600, priority: "" });
  const [templateKey, setTemplateKey] = useState(DNS_TEMPLATES[0].key);
  const [plan, setPlan] = useState<{ template: string; items: DiffPlanItem[] } | null>(null);
  const [applying, setApplying] = useState(false);

  function previewTemplate() {
    if (!domain) return;
    const template = DNS_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return;
    let variable = "";
    if (template.variable) {
      const input = window.prompt(`${template.variable.prompt}（例如 ${template.variable.example}）`);
      if (!input?.trim()) return;
      variable = input.trim();
    }
    const root = domain.full_domain.toLowerCase();
    const normalizeName = (value: string) => {
      const trimmed = value.toLowerCase().replace(/\.$/, "");
      if (trimmed === root || trimmed === "@" || trimmed === "") return "@";
      return trimmed.endsWith(`.${root}`) ? trimmed.slice(0, -(root.length + 1)) : trimmed;
    };
    const items = template.build(domain.full_domain, variable).map((item): DiffPlanItem => ({
      ...item,
      conflict: records.find((existing) => existing.type === item.type && normalizeName(existing.name) === normalizeName(item.name)) ?? null,
    }));
    setPlan({ template: template.label, items });
  }

  async function applyPlan() {
    if (!domain || !plan) return;
    setApplying(true);
    let successes = 0; let failures = 0;
    for (const item of plan.items) {
      try {
        const created = await api<DnsRecordView>(`/api/admin/domains/${domain.id}/dns`, {
          method: "POST",
          body: JSON.stringify({ type: item.type, name: item.name, content: item.content, ttl: item.ttl, priority: item.priority ?? null, proxied: item.proxied ?? null }),
        });
        setRecords((current) => [...current, created]);
        successes += 1;
      } catch { failures += 1; }
    }
    setApplying(false);
    setPlan(null);
    notify(`模板写入完成：成功 ${successes}，失败 ${failures}`, failures ? "error" : "success");
  }
  async function find(event: FormEvent) { event.preventDefault(); try { const page = await api<AdminDomainPage>(`/api/admin/domains?q=${encodeURIComponent(query)}&pageSize=50`); const exact = page.items.find((item) => item.full_domain.toLowerCase() === query.trim().toLowerCase()) ?? page.items[0]; if (!exact) throw new Error("未找到域名"); setDomain(exact); setLoading(true); const remote = await api<DnsRecordView[]>(`/api/admin/domains/${exact.id}/dns`); setRecords(remote); notify(`已从真实注册商读取 ${remote.length} 条 DNS 记录`); } catch (reason) { notify(reason instanceof Error ? reason.message : "DNS 读取失败", "error"); setRecords([]); } finally { setLoading(false); } }
  async function add(event: FormEvent) { event.preventDefault(); if (!domain) return; try { const created = await api<DnsRecordView>(`/api/admin/domains/${domain.id}/dns`, { method: "POST", body: JSON.stringify({ type: record.type, name: record.name, content: record.content, ttl: record.ttl, priority: record.priority ? Number(record.priority) : null }) }); setRecords((current) => [...current, created]); setRecord((current) => ({ ...current, content: "" })); notify("远端 DNS 创建成功，本地缓存已更新"); } catch (reason) { notify(reason instanceof Error ? reason.message : "DNS 创建失败", "error"); } }
  async function remove(id: string) { if (!domain || !window.confirm("确认从远端注册商删除这条 DNS 记录？")) return; try { await api(`/api/admin/domains/${domain.id}/dns/${encodeURIComponent(id)}`, { method: "DELETE" }); setRecords((current) => current.filter((item) => item.id !== id)); notify("远端 DNS 已删除"); } catch (reason) { notify(reason instanceof Error ? reason.message : "删除失败", "error"); } }
  return <div className="admin-stack"><Panel title="DNS 解析" description="所有读写都直接调用关联注册商；远端成功后才更新 D1 缓存"><form className="dns-search" onSubmit={(event) => void find(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入完整域名" required /><button className="primary-button">读取远端记录</button></form>{domain && <div className="dns-domain-meta"><strong>{domain.full_domain}</strong><span>{loading ? "正在连接注册商…" : `${records.length} 条远端记录`}</span></div>}{domain && <div className="dns-template-bar"><span>常用模板</span><select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} aria-label="DNS 模板">{DNS_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select><button className="secondary-button" onClick={() => previewTemplate()}>预览写入</button></div>}<div className="admin-table-wrap"><table className="admin-table dns-table"><thead><tr><th>类型</th><th>主机</th><th>记录值</th><th>TTL</th><th>优先级</th><th>代理</th><th>操作</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.type}</strong></td><td>{item.name}</td><td className="record-content">{item.content}</td><td>{item.ttl ?? "—"}</td><td>{item.priority ?? "—"}</td><td>{item.proxied === null ? "—" : item.proxied ? "是" : "否"}</td><td><button className="table-link danger-text" onClick={() => void remove(item.id)}>删除</button></td></tr>)}</tbody></table></div></Panel>{domain && <Panel title="添加 DNS 记录"><form className="dns-form" onSubmit={(event) => void add(event)}><label>类型<select value={record.type} onChange={(event) => setRecord({ ...record, type: event.target.value })}>{["A","AAAA","CNAME","MX","TXT","NS","CAA","SRV"].map((type) => <option key={type}>{type}</option>)}</select></label><label>主机<input value={record.name} onChange={(event) => setRecord({ ...record, name: event.target.value })} /></label><label className="record-value">记录值<input value={record.content} onChange={(event) => setRecord({ ...record, content: event.target.value })} required /></label><label>TTL<input type="number" value={record.ttl} onChange={(event) => setRecord({ ...record, ttl: Number(event.target.value) })} /></label><label>优先级<input type="number" value={record.priority} onChange={(event) => setRecord({ ...record, priority: event.target.value })} /></label><button className="primary-button">提交到远端</button></form></Panel>}{plan && domain && (
    <div className="modal-backdrop" onMouseDown={() => !applying && setPlan(null)}>
      <div className="contact-modal diff-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="DNS 模板写入预览">
        <button className="modal-close" onClick={() => setPlan(null)} disabled={applying}>×</button>
        <span className="section-kicker">DIFF 预览</span>
        <h2>{plan.template}</h2>
        <p>将写入 <strong>{domain.full_domain}</strong> 的远端注册商，共 {plan.items.length} 条记录。</p>
        <div className="diff-list">
          {plan.items.map((item, index) => (
            <div key={index} className={item.conflict ? "diff-conflict" : ""}>
              <span className={`badge-status ${item.conflict ? "badge-warning" : "badge-listed"}`}>{item.conflict ? "冲突" : "新增"}</span>
              <b>{item.type}</b>
              <em>{item.name}</em>
              <code>{item.content}{item.priority ? ` (优先级 ${item.priority})` : ""}{item.proxied ? " · Proxy" : ""}</code>
              {item.conflict && <small>已有同名 {item.conflict.type} 记录：{item.conflict.content}</small>}
            </div>
          ))}
        </div>
        {plan.items.some((item) => item.conflict) && <p className="diff-warning">存在冲突记录：确认写入会新增记录而非覆盖，可能产生重复解析，建议先删除旧记录。</p>}
        <div className="diff-actions">
          <button className="secondary-button" onClick={() => setPlan(null)} disabled={applying}>取消</button>
          <button className="primary-button" onClick={() => void applyPlan()} disabled={applying}>{applying ? "正在写入…" : "确认写入远端"}</button>
        </div>
      </div>
    </div>
  )}</div>;
}

interface SiteSettingsForm {
  site_name: string; site_description: string; site_bio: string | null; accent_color: string; display_density: "compact" | "comfortable" | "spacious";
  featured_first: number; copyright_text: string | null; icp_number: string | null;
  contact_email: string | null; contact_wechat: string | null; contact_telegram: string | null;
  logo_url: string | null; favicon_url: string | null; wechat_qr_url: string | null;
}

function SettingsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<SiteSettingsForm | null>(null);
  useEffect(() => { api<SiteSettingsForm>("/api/admin/settings").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取站点设置…</div>;
  function field<K extends keyof SiteSettingsForm>(key: K, value: SiteSettingsForm[K]) { setForm((current) => current ? { ...current, [key]: value } : current); }
  async function save(event: FormEvent) { event.preventDefault(); const current = form; if (!current) return; try { await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ ...current, featured_first: Boolean(current.featured_first) }) }); notify("站点设置已保存并影响前台"); } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); } }
  async function upload(file: File, target: "logo" | "favicon" | "wechatQr") { const body = new FormData(); body.set("file", file); body.set("target", target); try { const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body }); field(target === "logo" ? "logo_url" : target === "favicon" ? "favicon_url" : "wechat_qr_url", result.url); notify("图片已上传到 R2"); } catch (reason) { notify(reason instanceof Error ? reason.message : "上传失败", "error"); } }
  return <Panel title="站点设置" description="保存到 D1，前台刷新后生效"><form className="settings-form" onSubmit={(event) => void save(event)}><div className="form-grid"><label>站点名称<input value={form.site_name} onChange={(event) => field("site_name", event.target.value)} /></label><label>主题色<input type="color" value={form.accent_color} onChange={(event) => field("accent_color", event.target.value)} /></label><label className="wide">站点描述（前台 Slogan）<input value={form.site_description} onChange={(event) => field("site_description", event.target.value)} /></label><label className="wide">品牌简介 Bio（前台 Hero 副文案）<input value={form.site_bio ?? ""} onChange={(event) => field("site_bio", event.target.value || null)} maxLength={500} placeholder="一句话介绍你的域名收藏" /></label><label>页面密度<select value={form.display_density} onChange={(event) => field("display_density", event.target.value as SiteSettingsForm["display_density"])}><option value="compact">紧凑</option><option value="comfortable">舒适</option><option value="spacious">宽松</option></select></label><label>ICP 备案号<input value={form.icp_number ?? ""} onChange={(event) => field("icp_number", event.target.value || null)} /></label><label>公开联系邮箱<input type="email" value={form.contact_email ?? ""} onChange={(event) => field("contact_email", event.target.value || null)} /></label><label>微信<input value={form.contact_wechat ?? ""} onChange={(event) => field("contact_wechat", event.target.value || null)} /></label><label>Telegram<input value={form.contact_telegram ?? ""} onChange={(event) => field("contact_telegram", event.target.value || null)} /></label><label>版权文字<input value={form.copyright_text ?? ""} onChange={(event) => field("copyright_text", event.target.value || null)} placeholder="留空使用动态年份" /></label></div><div className="checkbox-row"><label><input type="checkbox" checked={Boolean(form.featured_first)} onChange={(event) => field("featured_first", event.target.checked ? 1 : 0)} />精品优先</label></div><div className="upload-grid">{(["logo", "favicon", "wechatQr"] as const).map((target) => <label className="upload-card" key={target}><span>{target === "logo" ? "Logo" : target === "favicon" ? "Favicon" : "微信二维码"}</span><small>PNG / JPEG / WebP，最大 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, target); }} /></label>)}</div><button className="primary-button">保存设置</button></form></Panel>;
}

interface NotificationForm {
  reminder_days_json: string; timezone: string;
  email_enabled: number; telegram_enabled: number; bark_enabled: number;
  serverchan_enabled: number; wecom_enabled: number; feishu_enabled: number; discord_enabled: number;
  email_recipient: string | null; telegram_chat_id: string | null;
  bark_configured: number; serverchan_configured: number; wecom_configured: number; feishu_configured: number; discord_configured: number;
}
type SecretChannel = "bark" | "serverchan" | "wecom" | "feishu" | "discord";
const SECRET_CHANNELS: Array<{ key: SecretChannel; label: string; placeholder: string; patchKey: string }> = [
  { key: "bark", label: "Bark", placeholder: "设备密钥", patchKey: "bark_device_key" },
  { key: "serverchan", label: "Server 酱", placeholder: "SendKey（sctapi.ftqq.com）", patchKey: "serverchan_key" },
  { key: "wecom", label: "企业微信机器人", placeholder: "Webhook URL（qyapi.weixin.qq.com）", patchKey: "wecom_webhook" },
  { key: "feishu", label: "飞书机器人", placeholder: "Webhook URL（open.feishu.cn）", patchKey: "feishu_webhook" },
  { key: "discord", label: "Discord", placeholder: "Webhook URL（discord.com）", patchKey: "discord_webhook" },
];

function NotificationsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<NotificationForm | null>(null);
  const [secrets, setSecrets] = useState<Record<SecretChannel, string>>({ bark: "", serverchan: "", wecom: "", feishu: "", discord: "" });
  useEffect(() => { api<NotificationForm>("/api/admin/notifications").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "通知设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取通知设置…</div>;
  const enabledOf = (key: SecretChannel) => Boolean(form[`${key}_enabled` as keyof NotificationForm]);
  const configuredOf = (key: SecretChannel) => Boolean(form[`${key}_configured` as keyof NotificationForm]);
  function setEnabled(key: SecretChannel, value: boolean) { setForm((current) => current ? { ...current, [`${key}_enabled`]: value ? 1 : 0 } : current); }
  async function save() {
    const current = form; if (!current) return;
    try {
      const reminderDays: unknown = JSON.parse(current.reminder_days_json);
      if (!Array.isArray(reminderDays) || !reminderDays.every((value) => Number.isInteger(value))) throw new Error("提醒天数必须是整数 JSON 数组");
      const body: Record<string, unknown> = {
        reminder_days: reminderDays,
        email_enabled: Boolean(current.email_enabled),
        telegram_enabled: Boolean(current.telegram_enabled),
        bark_enabled: Boolean(current.bark_enabled),
        serverchan_enabled: Boolean(current.serverchan_enabled),
        wecom_enabled: Boolean(current.wecom_enabled),
        feishu_enabled: Boolean(current.feishu_enabled),
        discord_enabled: Boolean(current.discord_enabled),
        email_recipient: current.email_recipient,
        telegram_chat_id: current.telegram_chat_id,
        timezone: "Asia/Shanghai",
      };
      for (const { key, patchKey } of SECRET_CHANNELS) { if (secrets[key]) body[patchKey] = secrets[key]; }
      await api("/api/admin/notifications", { method: "PATCH", body: JSON.stringify(body) });
      notify("通知设置已保存");
      setSecrets({ bark: "", serverchan: "", wecom: "", feishu: "", discord: "" });
    } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); }
  }
  async function test(channel: string) { try { await api("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({ channel }) }); notify(`${channel} 测试通知已真实发送`); } catch (reason) { notify(reason instanceof Error ? reason.message : "通知发送失败", "error"); } }
  return <Panel title="到期提醒与通知渠道" description="Cloudflare Cron 每天 09:00（Asia/Shanghai）检查；渠道同时用于前台求购线索推送；密钥/Webhook 一律 AES-GCM 加密存储">
    <div className="notification-stack">
      <label>提醒天数（JSON）<input value={form.reminder_days_json} onChange={(event) => setForm({ ...form, reminder_days_json: event.target.value })} /></label>
      <div className="channel-card"><label><input type="checkbox" checked={Boolean(form.email_enabled)} onChange={(event) => setForm({ ...form, email_enabled: event.target.checked ? 1 : 0 })} />Email</label><input type="email" value={form.email_recipient ?? ""} onChange={(event) => setForm({ ...form, email_recipient: event.target.value || null })} placeholder="收件邮箱" /><button onClick={() => void test("email")}>真实测试</button></div>
      <div className="channel-card"><label><input type="checkbox" checked={Boolean(form.telegram_enabled)} onChange={(event) => setForm({ ...form, telegram_enabled: event.target.checked ? 1 : 0 })} />Telegram</label><input value={form.telegram_chat_id ?? ""} onChange={(event) => setForm({ ...form, telegram_chat_id: event.target.value || null })} placeholder="Chat ID" /><button onClick={() => void test("telegram")}>真实测试</button></div>
      {SECRET_CHANNELS.map(({ key, label, placeholder }) => (
        <div className="channel-card" key={key}>
          <label><input type="checkbox" checked={enabledOf(key)} onChange={(event) => setEnabled(key, event.target.checked)} />{label}</label>
          <input type="password" value={secrets[key]} onChange={(event) => setSecrets((current) => ({ ...current, [key]: event.target.value }))} placeholder={configuredOf(key) ? "已加密配置；留空不修改" : placeholder} autoComplete="off" />
          <button onClick={() => void test(key)}>真实测试</button>
        </div>
      ))}
      <button className="primary-button align-start" onClick={() => void save()}>保存提醒设置</button>
    </div>
  </Panel>;
}

interface SessionRow { id: string; expires_at: string; created_at: string; last_seen_at: string; user_agent: string; ip_country: string | null; is_current: number; }
function SecurityView({ user, notify }: { user: AdminUser; notify: (text: string, tone?: "success" | "error") => void }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const load = useCallback(() => { api<SessionRow[]>("/api/auth/sessions").then(setSessions).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "会话加载失败", "error")); }, [notify]); useEffect(load, [load]);
  async function changePassword(event: FormEvent) { event.preventDefault(); try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(""); setNewPassword(""); notify("密码已修改，其他旧会话已失效"); load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "修改失败", "error"); } }
  return <div className="admin-stack"><Panel title="账户安全" description={`当前管理员：${user.email}`}><form className="security-form" onSubmit={(event) => void changePassword(event)}><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>新密码<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 12 位" /></label><button className="primary-button">修改密码</button></form></Panel><Panel title="当前会话" actions={<button className="secondary-button" onClick={() => void api<{ revoked: number }>("/api/auth/logout-others", { method: "POST" }).then((result) => { notify(`已退出其他 ${result.revoked} 个会话`); load(); })}>退出其他会话</button>}><div className="session-list">{sessions.map((session) => <div key={session.id}><div><strong>{session.is_current ? "当前设备" : "其他设备"}{session.ip_country ? ` · ${session.ip_country}` : ""}</strong><span>{session.user_agent}</span><small>最近活动 {new Date(session.last_seen_at).toLocaleString("zh-CN")} · 到期 {new Date(session.expires_at).toLocaleString("zh-CN")}</small></div>{!session.is_current && <button className="danger-text" onClick={() => void api(`/api/auth/sessions/${session.id}`, { method: "DELETE" }).then(() => { notify("会话已撤销"); load(); })}>撤销</button>}</div>)}</div></Panel></div>;
}

interface LogPage { items: Array<{ id: number; level: string; action: string; resource_type: string; message: string; success: number; created_at: string }>; total: number; }
function LogsView() {
  const [data, setData] = useState<LogPage | null>(null);
  const [level, setLevel] = useState("");
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = useCallback(() => {
    const search = new URLSearchParams({ pageSize: "100" });
    if (level) search.set("level", level);
    if (keyword.trim()) search.set("q", keyword.trim());
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return search;
  }, [from, keyword, level, to]);
  useEffect(() => { void api<LogPage>(`/api/admin/logs?${params()}`).then(setData).catch(() => setData({ items: [], total: 0 })); }, [params]);
  return <Panel title="操作日志" description="日志来自 D1，不记录密码、Token 或完整凭据；90 天前的日志由 Cron 自动清理" actions={<button className="secondary-button" onClick={() => void download(`/api/admin/logs/export?${params()}`)}>导出 CSV</button>}>
    <div className="log-filter">
      <select value={level} onChange={(event) => setLevel(event.target.value)} aria-label="级别筛选"><option value="">全部级别</option><option value="info">info</option><option value="warning">warning</option><option value="error">error</option></select>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="关键字（消息或动作）" aria-label="日志关键字" />
      <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="开始日期" />
      <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="结束日期" />
    </div>
    <div className="log-table">{data ? (data.items.length ? data.items.map((log) => <div key={log.id}><span className={log.success ? "dot-success" : "dot-error"} /><time>{new Date(log.created_at).toLocaleString("zh-CN")}</time><strong>{log.action}</strong><span>{log.message}</span></div>) : <div className="empty-inline">没有匹配的日志</div>) : <div className="empty-inline">正在读取日志…</div>}</div>
  </Panel>;
}

export function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null); const [checking, setChecking] = useState(true); const [view, setView] = useState<AdminView>("overview"); const [toast, setToast] = useState<ToastMessage | null>(null);
  const [domainsPresetTld, setDomainsPresetTld] = useState<string | undefined>(undefined);
  const notify = useCallback((text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone }), []);
  useEffect(() => { api<AdminUser>("/api/auth/me").then(setUser).catch((reason: unknown) => { if (!(reason instanceof ApiError) || reason.status !== 401) notify(reason instanceof Error ? reason.message : "会话检查失败", "error"); }).finally(() => setChecking(false)); }, [notify]);
  if (checking) return <div className="app-loading"><span className="brand-mark">玩</span><p>正在验证玩米会话…</p></div>;
  if (!user) return <LoginPage onLogin={(loggedIn) => { setUser(loggedIn); setView("overview"); }} />;
  const nav: Array<[AdminView, string, string]> = [["overview", "概览", "⌂"], ["domains", "域名管理", "◇"], ["categories", "分类", "⊞"], ["leads", "线索", "✉"], ["dns", "DNS 解析", "◎"], ["registrars", "注册商", "▦"], ["settings", "站点设置", "⚙"], ["notifications", "到期提醒", "◷"], ["security", "账户安全", "⌾"], ["logs", "操作日志", "≡"]];
  async function logout() { try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); } }
  return <div className="admin-shell"><aside className="admin-sidebar"><a href="/" className="brand admin-brand"><span className="brand-mark">玩</span><span>玩米</span></a><nav>{nav.map(([key, label, icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav><div className="sidebar-user"><div><strong>{user.email}</strong><span>管理员</span></div><button onClick={() => void logout()} title="退出登录">↪</button></div></aside><div className="admin-main"><header className="admin-header"><div><span>玩米管理后台</span><h1>{nav.find(([key]) => key === view)?.[1]}</h1></div><div className="admin-header-actions"><ThemeToggle /><a href="/" target="_blank">查看前台 ↗</a></div></header><main>{view === "overview" && <OverviewView onTldClick={(tld) => { setDomainsPresetTld(tld); setView("domains"); }} />}{view === "domains" && <DomainsView key={domainsPresetTld ?? "all"} notify={notify} presetTld={domainsPresetTld} />}{view === "categories" && <CategoriesView notify={notify} />}{view === "leads" && <LeadsView notify={notify} />}{view === "dns" && <DnsView notify={notify} />}{view === "registrars" && <RegistrarsView notify={notify} />}{view === "settings" && <SettingsView notify={notify} />}{view === "notifications" && <NotificationsView notify={notify} />}{view === "security" && <SecurityView user={user} notify={notify} />}{view === "logs" && <LogsView />}</main></div><Toast message={toast} onClose={() => setToast(null)} /></div>;
}
