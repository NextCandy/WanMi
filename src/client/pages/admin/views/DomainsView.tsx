import { useCallback, useEffect, useMemo, useState } from "react";

import { IconDownload, IconEdit, IconGlobe, IconPlus, IconTrash, IconUpload } from "../../../components/icons";
import { PromptModal } from "../../../components/PromptModal";
import { EmptyState, Pagination, SearchBar, SkeletonGrid } from "../../../components/ui";
import { api, download } from "../../../lib/api";
import { Panel } from "../Panel";
import type { AdminDomain, AdminDomainPage, CategoryRow, Notify } from "../types";

/** 后台筛选下拉的可选项，带真实计数，来自 /api/admin/domains/filters */
interface DomainFilterOptions {
  tlds: Array<{ tld: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
}

/** 需要弹窗输入的操作。删除类仍走 window.confirm。 */
type Dialog =
  | { kind: "add" }
  | { kind: "description"; domain: AdminDomain }
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
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<DomainFilterOptions>({ tlds: [], categories: [] });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);

  // 指派分类的下拉只列人工分类；自动标签是只读的，不能手动指派
  const manualCategories = useMemo(() => categories.filter((item) => !item.is_auto), [categories]);
  const manualCategoryNames = useMemo(
    () => new Set(manualCategories.map((item) => item.name)),
    [manualCategories],
  );

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (q) params.set("q", q);
    if (listed) params.set("listed", listed);
    if (featured) params.set("featured", featured);
    if (categoryFilter) params.set("category", categoryFilter);
    if (tld) params.set("tld", tld);
    setLoading(true);
    api<AdminDomainPage>(`/api/admin/domains?${params}`)
      .then(setData)
      .catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "域名加载失败", "error"))
      .finally(() => setLoading(false));
  }, [categoryFilter, featured, listed, notify, page, q, tld]);

  useEffect(load, [load, refresh]);
  useEffect(() => {
    api<CategoryRow[]>("/api/admin/categories").then(setCategories).catch(() => setCategories([]));
    api<DomainFilterOptions>("/api/admin/domains/filters")
      .then(setFilterOptions)
      .catch(() => setFilterOptions({ tlds: [], categories: [] }));
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
                `/api/admin/domains/export?q=${encodeURIComponent(q)}&listed=${listed}${tld ? `&tld=${encodeURIComponent(tld)}` : ""}`,
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
            onClick={() => void exportCsv(`/api/admin/domains/export?ids=${[...selected].join(",")}`)}
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
                  {domain.description ? (
                    <span title={domain.description}>{domain.description}</span>
                  ) : (
                    <span className="placeholder">暂无简介</span>
                  )}
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

                {/* 编辑简介放在操作区：简介列在平板/手机会隐藏，入口必须始终可用 */}
                <div className="record-actions">
                  <button
                    className="icon-btn"
                    style={{ width: 36, height: 36 }}
                    onClick={() => setDialog({ kind: "description", domain })}
                    aria-label={`编辑 ${domain.full_domain} 的简介`}
                    title="编辑简介"
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

      {dialog?.kind === "description" && (
        <PromptModal
          title="编辑公开简介"
          label={`${dialog.domain.full_domain} 的简介`}
          hint="简介会展示在前台域名卡片与详情页；留空表示不展示。"
          initialValue={dialog.domain.description}
          maxLength={500}
          multiline
          onCancel={() => setDialog(null)}
          onSubmit={(value) => {
            const target = dialog.domain;
            setDialog(null);
            void patch(target.id, { description: value }, value ? "简介已保存" : "简介已清空");
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
