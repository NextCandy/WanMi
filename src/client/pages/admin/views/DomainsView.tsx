import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconDownload, IconEdit, IconGlobe, IconPlus, IconTrash, IconUpload } from "../../../components/icons";
import { PromptModal } from "../../../components/PromptModal";
import { EmptyState, Modal, Pagination, SearchBar, SkeletonGrid } from "../../../components/ui";
import { api, download } from "../../../lib/api";
import { Panel } from "../Panel";
import type { AdminDomain, AdminDomainPage, CategoryRow, Notify } from "../types";

/** 后台筛选下拉的可选项，带真实计数，来自 /api/admin/domains/filters */
interface DomainFilterOptions {
  tlds: Array<{ tld: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  registrars: Array<{ registrar: string; count: number }>;
}

/** 需要弹窗输入的操作。删除类仍走 window.confirm。 */
type Dialog =
  | { kind: "add" }
  | { kind: "details"; domain: AdminDomain }
  | { kind: "new-category"; domain: AdminDomain }
  | { kind: "bulk-category" }
  | null;

export function DomainsView({ notify, presetTld }: { notify: Notify; presetTld?: string }) {
  const [data, setData] = useState<AdminDomainPage | null>(null);
  const [q, setQ] = useState("");
  const [listed, setListed] = useState("");
  const [featured, setFeatured] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tld, setTld] = useState(presetTld ?? "");
  const [registrar, setRegistrar] = useState("");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [expiresFrom, setExpiresFrom] = useState("");
  const [expiresTo, setExpiresTo] = useState("");
  const [order, setOrder] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<DomainFilterOptions>({ tlds: [], categories: [], registrars: [] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const latestLoadId = useRef(0);

  // 指派分类的下拉只列人工分类；自动标签是只读的，不能手动指派
  const manualCategories = useMemo(() => categories.filter((item) => !item.is_auto), [categories]);
  const manualCategoryNames = useMemo(
    () => new Set(manualCategories.map((item) => item.name)),
    [manualCategories],
  );

  const load = useCallback(() => {
    const loadId = ++latestLoadId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (q) params.set("q", q);
    if (listed) params.set("listed", listed);
    if (featured) params.set("featured", featured);
    if (categoryFilter) params.set("category", categoryFilter);
    if (tld) params.set("tld", tld);
    if (registrar) params.set("registrar", registrar);
    if (registeredFrom) params.set("registeredFrom", registeredFrom);
    if (registeredTo) params.set("registeredTo", registeredTo);
    if (expiresFrom) params.set("expiresFrom", expiresFrom);
    if (expiresTo) params.set("expiresTo", expiresTo);
    if (order) {
      const [orderBy, dir] = order.split(":");
      params.set("orderBy", orderBy);
      params.set("dir", dir);
    }
    setLoading(true);
    api<AdminDomainPage>(`/api/admin/domains?${params}`)
      .then((result) => {
        if (loadId === latestLoadId.current) setData(result);
      })
      .catch((reason: unknown) => {
        if (loadId === latestLoadId.current) {
          notify(reason instanceof Error ? reason.message : "域名加载失败", "error");
        }
      })
      .finally(() => {
        if (loadId === latestLoadId.current) setLoading(false);
      });
  }, [categoryFilter, expiresFrom, expiresTo, featured, listed, notify, order, page, q, registeredFrom, registeredTo, registrar, tld]);

  useEffect(load, [load, refresh]);
  useEffect(() => {
    api<CategoryRow[]>("/api/admin/categories").then(setCategories).catch(() => setCategories([]));
    api<DomainFilterOptions>("/api/admin/domains/filters")
      .then(setFilterOptions)
      .catch(() => setFilterOptions({ tlds: [], categories: [], registrars: [] }));
  }, [refresh]);

  const reload = () => setRefresh((value) => value + 1);

  async function patch(id: number, body: Record<string, unknown>, message: string) {
    try {
      await api(`/api/admin/domains/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      notify(message);
      reload();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "保存失败", "error");
    }
  }

  async function setCategoryFor(domain: AdminDomain, value: string) {
    if (value === "__new__") {
      setDialog({ kind: "new-category", domain });
      return;
    }
    await patch(domain.id, { category: value || null }, value ? "分类已更新" : "已恢复自动分类");
  }

  async function createCategoryAndAssign(domain: AdminDomain, name: string) {
    if (!name) return;
    try {
      await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
      await patch(domain.id, { category: name }, `已归入新分类 ${name}`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "新建分类失败", "error");
    }
  }

  async function addDomain(fullDomain: string) {
    if (!fullDomain) return;
    try {
      await api("/api/admin/domains", { method: "POST", body: JSON.stringify({ fullDomain }) });
      notify(`已添加 ${fullDomain}`);
      reload();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "添加失败", "error");
    }
  }

  async function removeDomain(domain: AdminDomain) {
    if (!window.confirm(`确认删除 ${domain.full_domain}？此操作不可撤销。`)) return;
    try {
      await api(`/api/admin/domains/${domain.id}`, { method: "DELETE" });
      notify(`已删除 ${domain.full_domain}`);
      reload();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "删除失败", "error");
    }
  }

  async function bulk(action: string, category?: string | null) {
    if (!selected.size) return;
    if (action === "delete" && !window.confirm(`确认删除所选 ${selected.size} 个真实域名？此操作不可撤销。`)) return;
    try {
      const result = await api<{ changed: number }>("/api/admin/domains/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected], action, category }),
      });
      notify(`已更新 ${result.changed} 个域名`);
      setSelected(new Set());
      reload();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "批量操作失败", "error");
    }
  }

  async function exportCsv(url: string) {
    try {
      await download(url);
      notify("CSV 已开始下载");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "CSV 导出失败", "error");
    }
  }

  async function importCsv(file: File) {
    try {
      const dryForm = new FormData();
      dryForm.set("file", file);
      dryForm.set("dryRun", "true");
      const dry = await api<{ report: { parsedCount: number; invalidCount: number; duplicateCount: number } }>(
        "/api/admin/domains/import",
        { method: "POST", body: dryForm },
      );
      if (
        !window.confirm(
          `解析 ${dry.report.parsedCount} 条；无效 ${dry.report.invalidCount}；重复 ${dry.report.duplicateCount}。继续导入合法记录？`,
        )
      )
        return;
      const form = new FormData();
      form.set("file", file);
      const result = await api<{ imported: number; errorCount: number; errorDownloadUrl: string | null }>(
        "/api/admin/domains/import",
        { method: "POST", body: form },
      );
      notify(`已导入/更新 ${result.imported} 条，错误 ${result.errorCount} 条`);
      if (result.errorDownloadUrl) await download(result.errorDownloadUrl);
      reload();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "导入失败", "error");
    }
  }

  function toggleSelect(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = Boolean(data?.items.length) && data!.items.every((item) => selected.has(item.id));
  const resetFilter = (next: () => void) => {
    next();
    setPage(1);
  };

  function exportQuery(ids?: number[]): string {
    if (ids) return `ids=${ids.join(",")}`;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (listed) params.set("listed", listed);
    if (featured) params.set("featured", featured);
    if (categoryFilter) params.set("category", categoryFilter);
    if (tld) params.set("tld", tld);
    if (registrar) params.set("registrar", registrar);
    if (registeredFrom) params.set("registeredFrom", registeredFrom);
    if (registeredTo) params.set("registeredTo", registeredTo);
    if (expiresFrom) params.set("expiresFrom", expiresFrom);
    if (expiresTo) params.set("expiresTo", expiresTo);
    return params.toString();
  }

  return (
    <Panel
      title="域名管理"
      description="前后台共享同一份 D1 数据"
      actions={
        <>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              void exportCsv(
                `/api/admin/domains/export?${exportQuery()}`,
              )
            }
          >
            <IconDownload size={16} /> 导出 CSV
          </button>
          <label className="btn btn-secondary btn-sm" style={{ position: "relative", overflow: "hidden" }}>
            <IconUpload size={16} /> 导入 CSV
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: "add" })}>
            <IconPlus size={16} /> 添加域名
          </button>
        </>
      }
    >
      <div className="admin-toolbar">
        <SearchBar
          size="sm"
          value={q}
          onChange={(value) => resetFilter(() => setQ(value))}
          placeholder="搜索完整域名"
        />
        <select value={listed} onChange={(event) => resetFilter(() => setListed(event.target.value))} aria-label="展示状态">
          <option value="">全部展示状态</option>
          <option value="true">前台展示</option>
          <option value="false">已隐藏</option>
        </select>
        <select
          value={featured}
          onChange={(event) => resetFilter(() => setFeatured(event.target.value))}
          aria-label="精品状态"
        >
          <option value="">全部精品状态</option>
          <option value="true">精品</option>
          <option value="false">非精品</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => resetFilter(() => setCategoryFilter(event.target.value))}
          aria-label="分类筛选"
        >
          <option value="">全部分类</option>
          {filterOptions.categories.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}（{item.count}）
            </option>
          ))}
        </select>
        <select value={tld} onChange={(event) => resetFilter(() => setTld(event.target.value))} aria-label="后缀筛选">
          <option value="">全部后缀</option>
          {filterOptions.tlds.map((item) => (
            <option key={item.tld} value={item.tld}>
              .{item.tld}（{item.count}）
            </option>
          ))}
        </select>
        <select value={registrar} onChange={(event) => resetFilter(() => setRegistrar(event.target.value))} aria-label="注册商筛选">
          <option value="">全部注册商</option>
          {filterOptions.registrars.map((item) => (
            <option key={item.registrar} value={item.registrar}>
              {item.registrar}（{item.count}）
            </option>
          ))}
        </select>
        <label className="admin-date-filter">
          <span>注册从</span>
          <input type="date" value={registeredFrom} onChange={(event) => resetFilter(() => setRegisteredFrom(event.target.value))} aria-label="注册日期从" />
        </label>
        <label className="admin-date-filter">
          <span>注册至</span>
          <input type="date" value={registeredTo} onChange={(event) => resetFilter(() => setRegisteredTo(event.target.value))} aria-label="注册日期至" />
        </label>
        <label className="admin-date-filter">
          <span>到期从</span>
          <input type="date" value={expiresFrom} onChange={(event) => resetFilter(() => setExpiresFrom(event.target.value))} aria-label="到期日期从" />
        </label>
        <label className="admin-date-filter">
          <span>到期至</span>
          <input type="date" value={expiresTo} onChange={(event) => resetFilter(() => setExpiresTo(event.target.value))} aria-label="到期日期至" />
        </label>
        <select value={order} onChange={(event) => resetFilter(() => setOrder(event.target.value))} aria-label="域名资料排序">
          <option value="">默认排序</option>
          <option value="domain:asc">域名 A → Z</option>
          <option value="domain:desc">域名 Z → A</option>
          <option value="registered_at:asc">注册日期从早到晚</option>
          <option value="registered_at:desc">注册日期从晚到早</option>
          <option value="expires_at:asc">到期日期从近到远</option>
          <option value="expires_at:desc">到期日期从远到近</option>
          <option value="registrar:asc">注册商 A → Z</option>
          <option value="registrar:desc">注册商 Z → A</option>
        </select>
        {(registrar || registeredFrom || registeredTo || expiresFrom || expiresTo || order) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setRegistrar("");
              setRegisteredFrom("");
              setRegisteredTo("");
              setExpiresFrom("");
              setExpiresTo("");
              setOrder("");
              setPage(1);
            }}
          >
            清除资料筛选
          </button>
        )}
        <span className="toolbar-count">{loading ? "读取中…" : `共 ${data?.total ?? 0} 个`}</span>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>已选 {selected.size}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => void bulk("feature")}>
            设为精品
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => void bulk("unfeature")}>
            取消精品
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => void bulk("list")}>
            上架
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => void bulk("hide")}>
            隐藏
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: "bulk-category" })}>
            设置分类
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void exportCsv(`/api/admin/domains/export?${exportQuery([...selected])}`)}
          >
            导出选中
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => void bulk("delete")}>
            删除
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            清空选择
          </button>
        </div>
      )}

      {loading && !data && <SkeletonGrid count={6} className="record-list" />}

      {data && data.items.length === 0 && !loading && (
        <EmptyState
          icon={<IconGlobe size={22} />}
          title="没有匹配的域名"
          hint="调整筛选条件，或添加新的域名。"
          action={
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "add" })}>
              添加域名
            </button>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <label className="check-row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              className="check"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(data.items.map((item) => item.id)))}
            />
            全选当前页（{data.items.length}）
          </label>

          <div className="record-list">
            {data.items.map((domain) => (
              <div className={`record${selected.has(domain.id) ? " selected" : ""}`} key={domain.id}>
                <input
                  type="checkbox"
                  className="check"
                  checked={selected.has(domain.id)}
                  onChange={() => toggleSelect(domain.id)}
                  aria-label={`选择 ${domain.full_domain}`}
                />

                <div className="record-main">
                  <strong>{domain.full_domain}</strong>
                  <small>
                    {domain.category_source === "manual" ? "人工" : "自动"} · {domain.auto_category}/
                    {domain.auto_subcategory}
                  </small>
                </div>

                <div className="record-desc">
                  <span title={domain.description || undefined}>{domain.description || "暂无简介"}</span>
                  <small>
                    {domain.registrar || "未填注册商"} · {domain.expires_at ? `${domain.expires_at} 到期` : "未填到期日"}
                  </small>
                </div>

                <div className="record-toggles">
                  <div className="record-toggle">
                    <button
                      className={`switch${domain.is_featured ? " on" : ""}`}
                      aria-label={`${domain.full_domain} 精品状态`}
                      aria-pressed={Boolean(domain.is_featured)}
                      onClick={() =>
                        void patch(
                          domain.id,
                          { isFeatured: !domain.is_featured },
                          domain.is_featured ? "已取消精品" : "已设为精品",
                        )
                      }
                    >
                      <i />
                    </button>
                    <span>精品</span>
                  </div>
                  <div className="record-toggle">
                    <button
                      className={`switch${domain.is_listed ? " on" : ""}`}
                      aria-label={`${domain.full_domain} 展示状态`}
                      aria-pressed={Boolean(domain.is_listed)}
                      onClick={() =>
                        void patch(
                          domain.id,
                          { isListed: !domain.is_listed },
                          domain.is_listed ? "已从前台隐藏" : "已恢复展示",
                        )
                      }
                    >
                      <i />
                    </button>
                    <span>展示</span>
                  </div>
                  <div className="record-toggle" style={{ minWidth: 120 }}>
                    <select
                      className="input"
                      style={{ minHeight: 36, fontSize: 12 }}
                      value={domain.category ?? ""}
                      onChange={(event) => void setCategoryFor(domain, event.target.value)}
                      aria-label={`${domain.full_domain} 分类`}
                    >
                      <option value="">自动（{domain.auto_category}）</option>
                      {domain.category && !manualCategoryNames.has(domain.category) && (
                        <option value={domain.category}>{domain.category}</option>
                      )}
                      {manualCategories.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                      <option value="__new__">＋ 新建分类…</option>
                    </select>
                  </div>
                </div>

                {/* 生命周期资料的编辑入口始终保留在操作区。 */}
                <div className="record-actions">
                  <button
                    className="icon-btn"
                    style={{ width: 36, height: 36 }}
                    onClick={() => setDialog({ kind: "details", domain })}
                    aria-label={`编辑 ${domain.full_domain} 的资料`}
                    title="编辑域名资料"
                  >
                    <IconEdit size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ width: 36, height: 36 }}
                    onClick={() => void removeDomain(domain)}
                    aria-label={`删除 ${domain.full_domain}`}
                    title={`删除 ${domain.full_domain}`}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {dialog?.kind === "add" && (
        <PromptModal
          title="添加域名"
          label="完整域名"
          placeholder="example.com"
          confirmText="添加"
          onCancel={() => setDialog(null)}
          onSubmit={(value) => {
            setDialog(null);
            void addDomain(value);
          }}
        />
      )}

      {dialog?.kind === "details" && (
        <DomainDetailsModal
          domain={dialog.domain}
          onCancel={() => setDialog(null)}
          onSubmit={(body) => {
            const target = dialog.domain;
            setDialog(null);
            void patch(target.id, body, "域名资料已保存");
          }}
        />
      )}

      {dialog?.kind === "new-category" && (
        <PromptModal
          title="新建分类"
          label="分类名称"
          maxLength={80}
          confirmText="创建并归类"
          onCancel={() => setDialog(null)}
          onSubmit={(value) => {
            const target = dialog.domain;
            setDialog(null);
            void createCategoryAndAssign(target, value);
          }}
        />
      )}

      {dialog?.kind === "bulk-category" && (
        <PromptModal
          title={`设置分类（${selected.size} 个域名）`}
          label="分类名称"
          hint="留空将清除人工分类，恢复为自动分类。"
          maxLength={80}
          onCancel={() => setDialog(null)}
          onSubmit={(value) => {
            setDialog(null);
            void bulk("categorize", value || null);
          }}
        />
      )}

    </Panel>
  );
}

function DomainDetailsModal({
  domain,
  onCancel,
  onSubmit,
}: {
  domain: AdminDomain;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [registeredAt, setRegisteredAt] = useState(domain.registered_at ?? "");
  const [expiresAt, setExpiresAt] = useState(domain.expires_at ?? "");
  const [registrar, setRegistrar] = useState(domain.registrar ?? "");
  const [description, setDescription] = useState(domain.description);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (registeredAt && expiresAt && registeredAt > expiresAt) return;
    onSubmit({
      registeredAt: registeredAt || null,
      expiresAt: expiresAt || null,
      registrar: registrar.trim() || null,
      description: description.trim(),
    });
  }

  const dateOrderInvalid = Boolean(registeredAt && expiresAt && registeredAt > expiresAt);
  return (
    <Modal title={`编辑 ${domain.full_domain}`} onClose={onCancel}>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>注册日期</span>
            <input type="date" value={registeredAt} onChange={(event) => setRegisteredAt(event.target.value)} />
          </label>
          <label className="field">
            <span>到期日期</span>
            <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
          <label className="field wide">
            <span>注册商</span>
            <input
              value={registrar}
              onChange={(event) => setRegistrar(event.target.value)}
              maxLength={120}
              placeholder="例如 Spaceship、GoDaddy"
            />
          </label>
          <label className="field wide">
            <span>公开简介</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="会展示在前台域名卡片中"
            />
            <small>{description.length} / 500</small>
          </label>
        </div>
        {dateOrderInvalid && <p className="field-error">到期日期不能早于注册日期</p>}
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={dateOrderInvalid}>保存</button>
        </div>
      </form>
    </Modal>
  );
}
