import { FormEvent, useEffect, useState } from "react";

export type DomainKind = "" | "digits" | "letters" | "alphanumeric" | "hyphen";

export interface AdvancedFilterValue {
  minLength: string;
  maxLength: string;
  contains: string;
  excludes: string;
  kind: DomainKind;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilterValue = {
  minLength: "",
  maxLength: "",
  contains: "",
  excludes: "",
  kind: "",
};

interface AdvancedSearchPanelProps {
  open: boolean;
  value: AdvancedFilterValue;
  onApply: (value: AdvancedFilterValue) => void;
  onClose: () => void;
  onReset: () => void;
}

export function AdvancedSearchPanel({ open, value, onApply, onClose, onReset }: AdvancedSearchPanelProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(value);
      setError("");
    }
  }, [open, value]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const min = draft.minLength ? Number(draft.minLength) : null;
    const max = draft.maxLength ? Number(draft.maxLength) : null;
    if (min !== null && max !== null && min > max) {
      setError("最小长度不能大于最大长度");
      return;
    }
    setError("");
    onApply({
      minLength: draft.minLength.trim(),
      maxLength: draft.maxLength.trim(),
      contains: draft.contains.trim(),
      excludes: draft.excludes.trim(),
      kind: draft.kind,
    });
  }

  return (
    <section className="advanced-search-panel" aria-labelledby="advanced-search-title">
      <div className="advanced-search-heading">
        <div><strong id="advanced-search-title">高级筛选</strong><span>筛选仅作用于公开域名，不会保存或上传搜索历史。</span></div>
        <button type="button" className="panel-close" onClick={onClose} aria-label="关闭高级筛选">×</button>
      </div>
      <form onSubmit={submit}>
        <label><span>最小长度</span><input type="number" min="1" max="253" inputMode="numeric" value={draft.minLength} onChange={(event) => setDraft((current) => ({ ...current, minLength: event.target.value }))} placeholder="例如 2" /></label>
        <label><span>最大长度</span><input type="number" min="1" max="253" inputMode="numeric" value={draft.maxLength} onChange={(event) => setDraft((current) => ({ ...current, maxLength: event.target.value }))} placeholder="例如 6" /></label>
        <label><span>必须包含</span><input value={draft.contains} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, contains: event.target.value }))} placeholder="例如 ai" /></label>
        <label><span>排除字符</span><input value={draft.excludes} maxLength={20} onChange={(event) => setDraft((current) => ({ ...current, excludes: event.target.value }))} placeholder="例如 123-" /></label>
        <label className="advanced-kind"><span>域名类型</span><select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as DomainKind }))}><option value="">全部类型</option><option value="digits">纯数字</option><option value="letters">纯字母</option><option value="alphanumeric">字母数字组合</option><option value="hyphen">含连字符</option></select></label>
        <div className="advanced-search-actions">
          {error && <span role="alert">{error}</span>}
          <button type="button" className="secondary-button" onClick={() => { setDraft(EMPTY_ADVANCED_FILTERS); onReset(); }}>重置</button>
          <button type="submit" className="primary-button">应用筛选</button>
        </div>
      </form>
    </section>
  );
}
