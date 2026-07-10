import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

import { ThemeToggle } from "../../components/ThemeToggle";
import { Toast, type ToastMessage } from "../../components/Toast";
import { ApiError, api, download } from "../../lib/api";

type AdminView = "overview" | "domains" | "dns" | "registrars" | "settings" | "notifications" | "security" | "logs";

interface AdminUser {
  id: number;
  email: string;
  sessionId: string;
}

interface DashboardData {
  counts: { total: number; listed: number; hidden: number; featured: number };
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
  buy_now_price: string | null;
  floor_price: string | null;
  min_offer: string | null;
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
        <a href="/" className="brand login-brand"><span className="brand-mark">W</span><span>WanMi</span></a>
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

function OverviewView() {
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
  return <div className="admin-stack">
    <div className="stat-grid">{cards.map(([label, value]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="admin-two-columns">
      <Panel title="后缀分布" description="来自 D1 当前域名表"><div className="distribution-list">{data.tlds.slice(0, 12).map((item) => <div key={item.tld}><span>.{item.tld}</span><div><i style={{ width: `${Math.max(4, item.count / Math.max(data.counts.total, 1) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div></Panel>
      <Panel title="市场状态" description="CSV 市场数据，不决定前台展示"><div className="status-list">{data.listingStatuses.map((item) => <div key={item.status}><span>{item.status}</span><strong>{item.count}</strong></div>)}</div></Panel>
    </div>
    <div className="admin-two-columns">
      <Panel title="最近操作"><div className="activity-list">{data.recentLogs.length ? data.recentLogs.map((log) => <div key={log.id}><span className={log.success ? "dot-success" : "dot-error"} /><div><strong>{log.message}</strong><small>{new Date(log.created_at).toLocaleString("zh-CN")}</small></div></div>) : <div className="empty-inline">暂无操作记录</div>}</div></Panel>
      <Panel title="基础设施状态"><div className="infra-list"><div><span>D1 域名数据库</span><strong className="status-ok">已连接</strong></div><div><span>注册商账户</span><strong>{data.registrarCount}</strong></div><div><span>到期数据</span><strong>{data.hasExpirationData ? "已同步" : "暂无到期数据"}</strong></div></div></Panel>
    </div>
  </div>;
}

function DomainsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [data, setData] = useState<AdminDomainPage | null>(null);
  const [q, setQ] = useState("");
  const [listed, setListed] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (q) params.set("q", q);
    if (listed) params.set("listed", listed);
    setLoading(true);
    api<AdminDomainPage>(`/api/admin/domains?${params}`)
      .then(setData)
      .catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "域名加载失败", "error"))
      .finally(() => setLoading(false));
  }, [listed, notify, page, q]);
  useEffect(load, [load, refresh]);

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
  return <Panel title="域名管理" description="前后台共享同一份 D1 数据" actions={<><button className="secondary-button" onClick={() => void download(`/api/admin/domains/export?q=${encodeURIComponent(q)}&listed=${listed}`)}>导出 CSV</button><label className="secondary-button file-button">导入 CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }} /></label><button className="primary-button" onClick={() => void addDomain()}>添加域名</button></>}>
    <div className="admin-toolbar"><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="搜索完整域名" /><select value={listed} onChange={(event) => { setListed(event.target.value); setPage(1); }}><option value="">全部展示状态</option><option value="true">前台展示</option><option value="false">已隐藏</option></select><span>{loading ? "读取中…" : `共 ${data?.total ?? 0} 个`}</span></div>
    {selected.size > 0 && <div className="bulk-bar"><strong>已选 {selected.size}</strong><button onClick={() => void bulk("feature")}>设为精品</button><button onClick={() => void bulk("unfeature")}>取消精品</button><button onClick={() => void bulk("list")}>上架</button><button onClick={() => void bulk("hide")}>隐藏</button><button onClick={() => void bulk("categorize")}>设置分类</button><button onClick={() => void bulkDns()}>批量 DNS</button><button className="danger-text" onClick={() => void bulk("delete")}>删除</button><button onClick={() => setSelected(new Set())}>清空选择</button></div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(data?.items.map((domain) => domain.id)))} aria-label="全选当前页" /></th><th>域名</th><th>分类</th><th>市场状态</th><th>报价</th><th>精品</th><th>前台展示</th><th>操作</th></tr></thead><tbody>{data?.items.map((domain) => <tr key={domain.id}><td><input type="checkbox" checked={selected.has(domain.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(domain.id)) next.delete(domain.id); else next.add(domain.id); return next; })} /></td><td><strong>{domain.full_domain}</strong><small>{domain.fast_transfer || "无 Fast Transfer 数据"}</small></td><td><button className="table-link" onClick={() => { const category = window.prompt("设置分类；留空清除", domain.category ?? ""); if (category !== null) void patch(domain.id, { category: category || null }, "分类已更新"); }}>{domain.category || "未分类"}</button></td><td>{domain.listing_status || "—"}</td><td>{domain.buy_now_price || "—"}</td><td><button className={`switch ${domain.is_featured ? "on gold" : ""}`} onClick={() => void patch(domain.id, { isFeatured: !domain.is_featured }, domain.is_featured ? "已取消精品" : "已设为精品")}><i /></button></td><td><button className={`switch ${domain.is_listed ? "on" : ""}`} onClick={() => void patch(domain.id, { isListed: !domain.is_listed }, domain.is_listed ? "已从前台隐藏" : "已恢复展示")}><i /></button></td><td><details className="row-details"><summary>详情</summary><div><span>Floor：{domain.floor_price ?? "—"}</span><span>Min Offer：{domain.min_offer ?? "—"}</span><span>Views：{domain.views ?? "—"}</span><span>Leads：{domain.leads ?? "—"}</span><span>Date Added：{domain.date_added_at ?? "—"}</span><span>GoDaddy NS：{domain.godaddy_ns ?? "—"}</span></div></details></td></tr>)}</tbody></table></div>
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
function DnsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [query, setQuery] = useState(""); const [domain, setDomain] = useState<AdminDomain | null>(null); const [records, setRecords] = useState<DnsRecordView[]>([]); const [loading, setLoading] = useState(false); const [record, setRecord] = useState({ type: "A", name: "@", content: "", ttl: 600, priority: "" });
  async function find(event: FormEvent) { event.preventDefault(); try { const page = await api<AdminDomainPage>(`/api/admin/domains?q=${encodeURIComponent(query)}&pageSize=50`); const exact = page.items.find((item) => item.full_domain.toLowerCase() === query.trim().toLowerCase()) ?? page.items[0]; if (!exact) throw new Error("未找到域名"); setDomain(exact); setLoading(true); const remote = await api<DnsRecordView[]>(`/api/admin/domains/${exact.id}/dns`); setRecords(remote); notify(`已从真实注册商读取 ${remote.length} 条 DNS 记录`); } catch (reason) { notify(reason instanceof Error ? reason.message : "DNS 读取失败", "error"); setRecords([]); } finally { setLoading(false); } }
  async function add(event: FormEvent) { event.preventDefault(); if (!domain) return; try { const created = await api<DnsRecordView>(`/api/admin/domains/${domain.id}/dns`, { method: "POST", body: JSON.stringify({ type: record.type, name: record.name, content: record.content, ttl: record.ttl, priority: record.priority ? Number(record.priority) : null }) }); setRecords((current) => [...current, created]); setRecord((current) => ({ ...current, content: "" })); notify("远端 DNS 创建成功，本地缓存已更新"); } catch (reason) { notify(reason instanceof Error ? reason.message : "DNS 创建失败", "error"); } }
  async function remove(id: string) { if (!domain || !window.confirm("确认从远端注册商删除这条 DNS 记录？")) return; try { await api(`/api/admin/domains/${domain.id}/dns/${encodeURIComponent(id)}`, { method: "DELETE" }); setRecords((current) => current.filter((item) => item.id !== id)); notify("远端 DNS 已删除"); } catch (reason) { notify(reason instanceof Error ? reason.message : "删除失败", "error"); } }
  return <div className="admin-stack"><Panel title="DNS 解析" description="所有读写都直接调用关联注册商；远端成功后才更新 D1 缓存"><form className="dns-search" onSubmit={(event) => void find(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入完整域名" required /><button className="primary-button">读取远端记录</button></form>{domain && <div className="dns-domain-meta"><strong>{domain.full_domain}</strong><span>{loading ? "正在连接注册商…" : `${records.length} 条远端记录`}</span></div>}<div className="admin-table-wrap"><table className="admin-table dns-table"><thead><tr><th>类型</th><th>主机</th><th>记录值</th><th>TTL</th><th>优先级</th><th>代理</th><th>操作</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.type}</strong></td><td>{item.name}</td><td className="record-content">{item.content}</td><td>{item.ttl ?? "—"}</td><td>{item.priority ?? "—"}</td><td>{item.proxied === null ? "—" : item.proxied ? "是" : "否"}</td><td><button className="table-link danger-text" onClick={() => void remove(item.id)}>删除</button></td></tr>)}</tbody></table></div></Panel>{domain && <Panel title="添加 DNS 记录"><form className="dns-form" onSubmit={(event) => void add(event)}><label>类型<select value={record.type} onChange={(event) => setRecord({ ...record, type: event.target.value })}>{["A","AAAA","CNAME","MX","TXT","NS","CAA","SRV"].map((type) => <option key={type}>{type}</option>)}</select></label><label>主机<input value={record.name} onChange={(event) => setRecord({ ...record, name: event.target.value })} /></label><label className="record-value">记录值<input value={record.content} onChange={(event) => setRecord({ ...record, content: event.target.value })} required /></label><label>TTL<input type="number" value={record.ttl} onChange={(event) => setRecord({ ...record, ttl: Number(event.target.value) })} /></label><label>优先级<input type="number" value={record.priority} onChange={(event) => setRecord({ ...record, priority: event.target.value })} /></label><button className="primary-button">提交到远端</button></form></Panel>}</div>;
}

interface SiteSettingsForm {
  site_name: string; site_description: string; accent_color: string; display_density: "compact" | "comfortable" | "spacious";
  featured_first: number; show_prices: number; copyright_text: string | null; icp_number: string | null;
  contact_email: string | null; contact_wechat: string | null; contact_telegram: string | null;
  logo_url: string | null; favicon_url: string | null; wechat_qr_url: string | null;
}

function SettingsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<SiteSettingsForm | null>(null);
  useEffect(() => { api<SiteSettingsForm>("/api/admin/settings").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取站点设置…</div>;
  function field<K extends keyof SiteSettingsForm>(key: K, value: SiteSettingsForm[K]) { setForm((current) => current ? { ...current, [key]: value } : current); }
  async function save(event: FormEvent) { event.preventDefault(); const current = form; if (!current) return; try { await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ ...current, featured_first: Boolean(current.featured_first), show_prices: Boolean(current.show_prices) }) }); notify("站点设置已保存并影响前台"); } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); } }
  async function upload(file: File, target: "logo" | "favicon" | "wechatQr") { const body = new FormData(); body.set("file", file); body.set("target", target); try { const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", body }); field(target === "logo" ? "logo_url" : target === "favicon" ? "favicon_url" : "wechat_qr_url", result.url); notify("图片已上传到 R2"); } catch (reason) { notify(reason instanceof Error ? reason.message : "上传失败", "error"); } }
  return <Panel title="站点设置" description="保存到 D1，前台刷新后生效"><form className="settings-form" onSubmit={(event) => void save(event)}><div className="form-grid"><label>站点名称<input value={form.site_name} onChange={(event) => field("site_name", event.target.value)} /></label><label>主题色<input type="color" value={form.accent_color} onChange={(event) => field("accent_color", event.target.value)} /></label><label className="wide">站点描述<input value={form.site_description} onChange={(event) => field("site_description", event.target.value)} /></label><label>页面密度<select value={form.display_density} onChange={(event) => field("display_density", event.target.value as SiteSettingsForm["display_density"])}><option value="compact">紧凑</option><option value="comfortable">舒适</option><option value="spacious">宽松</option></select></label><label>ICP 备案号<input value={form.icp_number ?? ""} onChange={(event) => field("icp_number", event.target.value || null)} /></label><label>公开联系邮箱<input type="email" value={form.contact_email ?? ""} onChange={(event) => field("contact_email", event.target.value || null)} /></label><label>微信<input value={form.contact_wechat ?? ""} onChange={(event) => field("contact_wechat", event.target.value || null)} /></label><label>Telegram<input value={form.contact_telegram ?? ""} onChange={(event) => field("contact_telegram", event.target.value || null)} /></label><label>版权文字<input value={form.copyright_text ?? ""} onChange={(event) => field("copyright_text", event.target.value || null)} placeholder="留空使用动态年份" /></label></div><div className="checkbox-row"><label><input type="checkbox" checked={Boolean(form.featured_first)} onChange={(event) => field("featured_first", event.target.checked ? 1 : 0)} />精品优先</label><label><input type="checkbox" checked={Boolean(form.show_prices)} onChange={(event) => field("show_prices", event.target.checked ? 1 : 0)} />显示已审核公开价格</label></div><div className="upload-grid">{(["logo", "favicon", "wechatQr"] as const).map((target) => <label className="upload-card" key={target}><span>{target === "logo" ? "Logo" : target === "favicon" ? "Favicon" : "微信二维码"}</span><small>PNG / JPEG / WebP，最大 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, target); }} /></label>)}</div><button className="primary-button">保存设置</button></form></Panel>;
}

interface NotificationForm { reminder_days_json: string; email_enabled: number; telegram_enabled: number; bark_enabled: number; email_recipient: string | null; telegram_chat_id: string | null; timezone: string; bark_configured: number; }
function NotificationsView({ notify }: { notify: (text: string, tone?: "success" | "error") => void }) {
  const [form, setForm] = useState<NotificationForm | null>(null); const [barkKey, setBarkKey] = useState("");
  useEffect(() => { api<NotificationForm>("/api/admin/notifications").then(setForm).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "通知设置加载失败", "error")); }, [notify]);
  if (!form) return <div className="state-panel">正在读取通知设置…</div>;
  async function save() { const current = form; if (!current) return; try { const reminderDays: unknown = JSON.parse(current.reminder_days_json); if (!Array.isArray(reminderDays) || !reminderDays.every((value) => Number.isInteger(value))) throw new Error("提醒天数必须是整数 JSON 数组"); await api("/api/admin/notifications", { method: "PATCH", body: JSON.stringify({ reminder_days: reminderDays, email_enabled: Boolean(current.email_enabled), telegram_enabled: Boolean(current.telegram_enabled), bark_enabled: Boolean(current.bark_enabled), email_recipient: current.email_recipient, telegram_chat_id: current.telegram_chat_id, bark_device_key: barkKey || undefined, timezone: "Asia/Shanghai" }) }); notify("通知设置已保存"); setBarkKey(""); } catch (reason) { notify(reason instanceof Error ? reason.message : "保存失败", "error"); } }
  async function test(channel: "email" | "telegram" | "bark") { try { await api("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({ channel }) }); notify(`${channel} 测试通知已真实发送`); } catch (reason) { notify(reason instanceof Error ? reason.message : "通知发送失败", "error"); } }
  return <Panel title="到期提醒" description="Cloudflare Cron 每天 09:00（Asia/Shanghai）检查；没有到期数据时不会发送"><div className="notification-stack"><label>提醒天数（JSON）<input value={form.reminder_days_json} onChange={(event) => setForm({ ...form, reminder_days_json: event.target.value })} /></label><div className="channel-card"><label><input type="checkbox" checked={Boolean(form.email_enabled)} onChange={(event) => setForm({ ...form, email_enabled: event.target.checked ? 1 : 0 })} />Email</label><input type="email" value={form.email_recipient ?? ""} onChange={(event) => setForm({ ...form, email_recipient: event.target.value || null })} placeholder="收件邮箱" /><button onClick={() => void test("email")}>真实测试</button></div><div className="channel-card"><label><input type="checkbox" checked={Boolean(form.telegram_enabled)} onChange={(event) => setForm({ ...form, telegram_enabled: event.target.checked ? 1 : 0 })} />Telegram</label><input value={form.telegram_chat_id ?? ""} onChange={(event) => setForm({ ...form, telegram_chat_id: event.target.value || null })} placeholder="Chat ID" /><button onClick={() => void test("telegram")}>真实测试</button></div><div className="channel-card"><label><input type="checkbox" checked={Boolean(form.bark_enabled)} onChange={(event) => setForm({ ...form, bark_enabled: event.target.checked ? 1 : 0 })} />Bark</label><input type="password" value={barkKey} onChange={(event) => setBarkKey(event.target.value)} placeholder={form.bark_configured ? "已加密配置；留空不修改" : "设备密钥"} /><button onClick={() => void test("bark")}>真实测试</button></div><button className="primary-button align-start" onClick={() => void save()}>保存提醒设置</button></div></Panel>;
}

interface SessionRow { id: string; expires_at: string; created_at: string; last_seen_at: string; user_agent: string; is_current: number; }
function SecurityView({ user, notify }: { user: AdminUser; notify: (text: string, tone?: "success" | "error") => void }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const load = useCallback(() => { api<SessionRow[]>("/api/auth/sessions").then(setSessions).catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "会话加载失败", "error")); }, [notify]); useEffect(load, [load]);
  async function changePassword(event: FormEvent) { event.preventDefault(); try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(""); setNewPassword(""); notify("密码已修改，其他旧会话已失效"); load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "修改失败", "error"); } }
  return <div className="admin-stack"><Panel title="账户安全" description={`当前管理员：${user.email}`}><form className="security-form" onSubmit={(event) => void changePassword(event)}><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>新密码<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 12 位" /></label><button className="primary-button">修改密码</button></form></Panel><Panel title="当前会话" actions={<button className="secondary-button" onClick={() => void api<{ revoked: number }>("/api/auth/logout-others", { method: "POST" }).then((result) => { notify(`已退出其他 ${result.revoked} 个会话`); load(); })}>退出其他会话</button>}><div className="session-list">{sessions.map((session) => <div key={session.id}><div><strong>{session.is_current ? "当前设备" : "其他设备"}</strong><span>{session.user_agent}</span><small>最近活动 {new Date(session.last_seen_at).toLocaleString("zh-CN")} · 到期 {new Date(session.expires_at).toLocaleString("zh-CN")}</small></div>{!session.is_current && <button className="danger-text" onClick={() => void api(`/api/auth/sessions/${session.id}`, { method: "DELETE" }).then(() => { notify("会话已撤销"); load(); })}>撤销</button>}</div>)}</div></Panel></div>;
}

interface LogPage { items: Array<{ id: number; level: string; action: string; resource_type: string; message: string; success: number; created_at: string }>; total: number; }
function LogsView() { const [data, setData] = useState<LogPage | null>(null); useEffect(() => { void api<LogPage>("/api/admin/logs?pageSize=100").then(setData); }, []); return <Panel title="操作日志" description="日志来自 D1，不记录密码、Token 或完整凭据"><div className="log-table">{data?.items.map((log) => <div key={log.id}><span className={log.success ? "dot-success" : "dot-error"} /><time>{new Date(log.created_at).toLocaleString("zh-CN")}</time><strong>{log.action}</strong><span>{log.message}</span></div>) ?? <div className="empty-inline">正在读取日志…</div>}</div></Panel>; }

export function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null); const [checking, setChecking] = useState(true); const [view, setView] = useState<AdminView>("overview"); const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((text: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), text, tone }), []);
  useEffect(() => { api<AdminUser>("/api/auth/me").then(setUser).catch((reason: unknown) => { if (!(reason instanceof ApiError) || reason.status !== 401) notify(reason instanceof Error ? reason.message : "会话检查失败", "error"); }).finally(() => setChecking(false)); }, [notify]);
  if (checking) return <div className="app-loading"><span className="brand-mark">W</span><p>正在验证 WanMi 会话…</p></div>;
  if (!user) return <LoginPage onLogin={(loggedIn) => { setUser(loggedIn); setView("overview"); }} />;
  const nav: Array<[AdminView, string, string]> = [["overview", "概览", "⌂"], ["domains", "域名管理", "◇"], ["dns", "DNS 解析", "◎"], ["registrars", "注册商", "▦"], ["settings", "站点设置", "⚙"], ["notifications", "到期提醒", "◷"], ["security", "账户安全", "⌾"], ["logs", "操作日志", "≡"]];
  async function logout() { try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); } }
  return <div className="admin-shell"><aside className="admin-sidebar"><a href="/" className="brand admin-brand"><span className="brand-mark">W</span><span>WanMi</span></a><nav>{nav.map(([key, label, icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav><div className="sidebar-user"><div><strong>{user.email}</strong><span>管理员</span></div><button onClick={() => void logout()} title="退出登录">↪</button></div></aside><div className="admin-main"><header className="admin-header"><div><span>WanMi 管理后台</span><h1>{nav.find(([key]) => key === view)?.[1]}</h1></div><div className="admin-header-actions"><ThemeToggle /><a href="/" target="_blank">查看前台 ↗</a></div></header><main>{view === "overview" && <OverviewView />}{view === "domains" && <DomainsView notify={notify} />}{view === "dns" && <DnsView notify={notify} />}{view === "registrars" && <RegistrarsView notify={notify} />}{view === "settings" && <SettingsView notify={notify} />}{view === "notifications" && <NotificationsView notify={notify} />}{view === "security" && <SecurityView user={user} notify={notify} />}{view === "logs" && <LogsView />}</main></div><Toast message={toast} onClose={() => setToast(null)} /></div>;
}
