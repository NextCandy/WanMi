import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_FOLDER_ID, type FavoriteEntry, type FavoriteFolder } from "../hooks/useDomainFavorites";
import type { PublicDomain } from "../../shared/types/api";
import { getSimilarDomains } from "../lib/domain-discovery";

interface DomainDetailDialogProps {
  domain: PublicDomain | null;
  candidates: PublicDomain[];
  favorite: boolean;
  entry: FavoriteEntry | null;
  folders: FavoriteFolder[];
  onClose: () => void;
  onCopy: (domain: string) => void;
  onFavorite: (domain: PublicDomain) => void;
  onSelect: (domain: PublicDomain) => void;
  onSetNote: (id: number, note: string) => void;
  onSetTags: (id: number, tags: string[]) => void;
  onMoveFolder: (id: number, folderId: string) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

export function DomainDetailDialog({ domain, candidates, favorite, entry, folders, onClose, onCopy, onFavorite, onSelect, onSetNote, onSetTags, onMoveFolder }: DomainDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const similar = useMemo(() => domain ? getSimilarDomains(domain, candidates) : [], [candidates, domain]);
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (domain && dialog && !dialog.open) dialog.showModal();
  }, [domain]);

  // 切换域名时同步草稿备注
  useEffect(() => {
    setNote(entry?.note ?? "");
    setTagDraft("");
  }, [domain?.id, entry?.note]);

  if (!domain) return null;
  const categories = domain.categories.length ? domain.categories : domain.category ? [domain.category] : [];
  const tags = entry?.tags ?? [];

  function commitNote() {
    if (domain && entry && note !== entry.note) onSetNote(domain.id, note);
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!domain || !entry || !value) return;
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) { setTagDraft(""); return; }
    onSetTags(domain.id, [...tags, value]);
    setTagDraft("");
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    } else if (event.key === "Backspace" && !tagDraft && tags.length) {
      onSetTags(domain!.id, tags.slice(0, -1));
    }
  }

  return (
    <dialog ref={dialogRef} className="domain-detail-dialog" aria-labelledby="quick-domain-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section>
        <button type="button" className="modal-close" onClick={onClose} aria-label="关闭域名速览" autoFocus>×</button>
        <span className="detail-kicker">DOMAIN QUICK VIEW</span>
        <h2 id="quick-domain-title">{domain.name}<span>.{domain.tld}</span></h2>
        <div className="detail-badges">{domain.is_featured && <span className="chip chip-featured">精品域名</span>}{categories.map((category) => <span className="chip" key={category}>{category}</span>)}</div>
        <p className="detail-description">{domain.description || "这个域名暂未填写公开简介。"}</p>
        <dl className="quick-detail-grid">
          <div><dt>完整域名</dt><dd>{domain.domain}</dd></div>
          <div><dt>主体长度</dt><dd>{domain.name.length} 字符</dd></div>
          <div><dt>后缀</dt><dd>.{domain.tld}</dd></div>
          <div><dt>注册日期</dt><dd>{formatDate(domain.registered_at)}</dd></div>
          <div><dt>到期日期</dt><dd>{formatDate(domain.expires_at)}</dd></div>
        </dl>
        <div className="quick-detail-actions">
          <button type="button" className="secondary-button" onClick={() => onCopy(domain.domain)}>复制域名</button>
          <button type="button" className={`secondary-button${favorite ? " is-favorite" : ""}`} aria-pressed={favorite} onClick={() => onFavorite(domain)}>{favorite ? "取消收藏" : "收藏域名"}</button>
          <a className="secondary-button" href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer">访问域名 ↗</a>
        </div>

        {favorite && entry && (
          <div className="favorite-editor">
            <div className="favorite-editor-head">
              <strong>收藏管理</strong>
              <span className="favorite-local-hint">仅保存在当前浏览器</span>
            </div>
            <label className="favorite-field">
              <span>收藏夹</span>
              <select value={entry.folderId} onChange={(event) => onMoveFolder(domain.id, event.target.value)}>
                <option value={DEFAULT_FOLDER_ID}>默认收藏</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <div className="favorite-field">
              <span>标签</span>
              <div className="favorite-tags">
                {tags.map((tag) => (
                  <span className="favorite-tag" key={tag}>{tag}<button type="button" aria-label={`删除标签 ${tag}`} onClick={() => onSetTags(domain.id, tags.filter((item) => item !== tag))}>×</button></span>
                ))}
                <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={onTagKeyDown} onBlur={addTag} placeholder={tags.length ? "继续添加" : "添加标签，回车确认"} aria-label="添加标签" maxLength={24} />
              </div>
            </div>
            <label className="favorite-field">
              <span>私人备注</span>
              <textarea value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)} onBlur={commitNote} placeholder="只保存在本机，不会上传服务器" aria-label="私人备注" />
            </label>
          </div>
        )}

        {similar.length > 0 && <div className="quick-similar"><strong>相似域名</strong><div>{similar.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}>{item.domain}</button>)}</div></div>}
      </section>
    </dialog>
  );
}
