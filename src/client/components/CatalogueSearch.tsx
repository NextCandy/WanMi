import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { loadCatalogue } from "../lib/catalogue-cache";
import { highlightText } from "../lib/highlight";
import type { Paginated, PublicDomain } from "../../shared/types/api";

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.1 4.1"/></svg>;
}

type SuggestKind = "domain" | "featured" | "tld" | "history";
interface SuggestItem {
  kind: SuggestKind;
  key: string;
  label: string;
  hint?: string;
  apply: () => void;
}

interface CatalogueSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear: () => void;
  history: string[];
  onRemoveHistory: (value: string) => void;
  onClearHistory: () => void;
  tlds: string[];
  featuredCount: number;
  onSelectDomain: (domain: PublicDomain) => void;
  onSelectTld: (tld: string) => void;
  onShowFeatured: () => void;
}

const SUGGEST_LIMIT = 6;
const TLD_LIMIT = 4;
const HISTORY_LIMIT = 6;

export function CatalogueSearch({
  value,
  onChange,
  onSubmit,
  onClear,
  history,
  onRemoveHistory,
  onClearHistory,
  tlds,
  featuredCount,
  onSelectDomain,
  onSelectTld,
  onShowFeatured,
}: CatalogueSearchProps) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [matches, setMatches] = useState<PublicDomain[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number>(0);
  const query = value.trim();
  const lowerQuery = query.toLowerCase();

  // `/` 全局快捷键聚焦搜索（正在输入框/文本域时不拦截）
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 域名建议：250ms 防抖 + 序列守卫，命中缓存去重；空词或未聚焦不请求
  useEffect(() => {
    if (!focused || query.length < 1) {
      setMatches([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void loadCatalogue(`/api/public/domains?q=${encodeURIComponent(query)}&pageSize=${SUGGEST_LIMIT}`)
        .then((result: Paginated<PublicDomain>) => {
          if (alive) setMatches(result.items);
        })
        .catch(() => {
          if (alive) setMatches([]);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [focused, query]);

  const tldMatches = useMemo(() => {
    if (!lowerQuery) return [];
    const bare = lowerQuery.replace(/^\./, "");
    return tlds.filter((tld) => tld.includes(bare)).slice(0, TLD_LIMIT);
  }, [lowerQuery, tlds]);

  const historyMatches = useMemo(() => {
    const list = lowerQuery ? history.filter((item) => item.toLowerCase().includes(lowerQuery)) : history;
    return list.slice(0, HISTORY_LIMIT);
  }, [history, lowerQuery]);

  // 键盘导航所依据的扁平可操作列表（顺序即视觉顺序）
  const items = useMemo<SuggestItem[]>(() => {
    const next: SuggestItem[] = [];
    matches.forEach((domain) =>
      next.push({ kind: "domain", key: `d-${domain.id}`, label: domain.domain, apply: () => onSelectDomain(domain) }),
    );
    if (query && featuredCount > 0) {
      next.push({ kind: "featured", key: "featured", label: "只看精品", hint: `${featuredCount} 个`, apply: onShowFeatured });
    }
    tldMatches.forEach((tld) =>
      next.push({ kind: "tld", key: `t-${tld}`, label: `后缀 .${tld}`, apply: () => onSelectTld(tld) }),
    );
    historyMatches.forEach((item) =>
      next.push({ kind: "history", key: `h-${item}`, label: item, apply: () => onSubmit(item) }),
    );
    return next;
  }, [matches, query, featuredCount, tldMatches, historyMatches, onSelectDomain, onShowFeatured, onSelectTld, onSubmit]);

  useEffect(() => {
    setActive((current) => (current >= items.length ? items.length - 1 : current));
  }, [items.length]);

  const open = focused && items.length > 0;

  function commit() {
    window.clearTimeout(blurTimer.current);
    if (active >= 0 && active < items.length) items[active].apply();
    else onSubmit(value);
    setFocused(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    commit();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!items.length) return;
      setActive((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      // 显式处理 Enter：命中建议项即应用该项，否则提交当前输入（不依赖表单隐式提交）
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setFocused(false);
        setActive(-1);
      }
    }
  }

  function handleBlur() {
    // 延迟关闭，保证建议项的点击先于失焦生效
    blurTimer.current = window.setTimeout(() => {
      setFocused(false);
      setActive(-1);
    }, 120);
  }

  function activate(item: SuggestItem) {
    window.clearTimeout(blurTimer.current);
    item.apply();
    setFocused(false);
    setActive(-1);
  }

  const sections: Array<{ kind: SuggestKind; title: string; list: SuggestItem[] }> = [
    { kind: "domain", title: "匹配域名", list: items.filter((item) => item.kind === "domain") },
    { kind: "featured", title: "快捷", list: items.filter((item) => item.kind === "featured" || item.kind === "tld") },
    { kind: "history", title: "最近搜索", list: items.filter((item) => item.kind === "history") },
  ];

  return (
    <div className="search-area" onFocus={() => { window.clearTimeout(blurTimer.current); setFocused(true); }} onBlur={handleBlur}>
      <form className="filter-search" onSubmit={submit} role="search">
        <SearchIcon />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => { onChange(event.target.value); setActive(-1); }}
          onKeyDown={onInputKeyDown}
          placeholder="搜索完整域名，例如 wanmi.org"
          aria-label="搜索域名"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggest-list"
          aria-activedescendant={open && active >= 0 ? `search-suggest-${active}` : undefined}
          aria-autocomplete="list"
        />
        {value && <button className="search-clear" type="button" aria-label="清空搜索" onClick={onClear}>×</button>}
        <button className="search-submit" type="submit">搜索</button>
      </form>
      {open && (
        <div className="search-suggest" id="search-suggest-list" role="listbox" aria-label="搜索建议">
          {sections.map((section) =>
            section.list.length === 0 ? null : (
              <div className="suggest-group" key={section.kind}>
                <header>
                  <span>{section.title}</span>
                  {section.kind === "history" && (
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClearHistory}>清空</button>
                  )}
                </header>
                {section.list.map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <div
                      key={item.key}
                      id={`search-suggest-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={`suggest-row${index === active ? " active" : ""} suggest-${item.kind}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => activate(item)}
                    >
                      <span className="suggest-label">{highlightText(item.label, query)}</span>
                      {item.hint && <em className="suggest-hint">{item.hint}</em>}
                      {item.kind === "history" && (
                        <button
                          type="button"
                          className="suggest-remove"
                          aria-label={`删除搜索记录 ${item.label}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => { event.stopPropagation(); onRemoveHistory(item.label); }}
                        >×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
