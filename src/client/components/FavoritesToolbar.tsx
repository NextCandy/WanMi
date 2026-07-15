import { FormEvent, useMemo, useState } from "react";

import { DEFAULT_FOLDER_ID, type FavoriteEntry, type FavoriteFolder } from "../hooks/useDomainFavorites";

export const ALL_FOLDERS = "__all";

interface FavoritesToolbarProps {
  folders: FavoriteFolder[];
  entries: FavoriteEntry[];
  allTags: string[];
  selectedFolder: string;
  selectedTag: string;
  onSelectFolder: (id: string) => void;
  onSelectTag: (tag: string) => void;
  onAddFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRemoveFolder: (id: string) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImport: () => void;
  onClear: () => void;
}

export function FavoritesToolbar({
  folders,
  entries,
  allTags,
  selectedFolder,
  selectedTag,
  onSelectFolder,
  onSelectTag,
  onAddFolder,
  onRenameFolder,
  onRemoveFolder,
  onExportJson,
  onExportCsv,
  onImport,
  onClear,
}: FavoritesToolbarProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => map.set(entry.folderId, (map.get(entry.folderId) ?? 0) + 1));
    return map;
  }, [entries]);
  const defaultCount = counts.get(DEFAULT_FOLDER_ID) ?? 0;
  const activeCustomFolder = folders.find((folder) => folder.id === selectedFolder) ?? null;

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (name) onAddFolder(name);
    setDraftName("");
    setCreating(false);
  }

  function submitRename(event: FormEvent) {
    event.preventDefault();
    const name = renameDraft.trim();
    if (activeCustomFolder && name) onRenameFolder(activeCustomFolder.id, name);
    setRenaming(false);
  }

  return (
    <div className="favorites-toolbar">
      <div className="fav-folders" role="tablist" aria-label="收藏夹">
        <button type="button" role="tab" aria-selected={selectedFolder === ALL_FOLDERS} className={selectedFolder === ALL_FOLDERS ? "active" : ""} onClick={() => onSelectFolder(ALL_FOLDERS)}>全部 <em>{entries.length}</em></button>
        <button type="button" role="tab" aria-selected={selectedFolder === DEFAULT_FOLDER_ID} className={selectedFolder === DEFAULT_FOLDER_ID ? "active" : ""} onClick={() => onSelectFolder(DEFAULT_FOLDER_ID)}>默认收藏 <em>{defaultCount}</em></button>
        {folders.map((folder) => (
          <button type="button" role="tab" key={folder.id} aria-selected={selectedFolder === folder.id} className={selectedFolder === folder.id ? "active" : ""} onClick={() => onSelectFolder(folder.id)}>{folder.name} <em>{counts.get(folder.id) ?? 0}</em></button>
        ))}
        {creating ? (
          <form className="fav-inline-form" onSubmit={submitCreate}>
            <input autoFocus value={draftName} maxLength={40} placeholder="收藏夹名称" aria-label="新收藏夹名称" onChange={(event) => setDraftName(event.target.value)} onBlur={submitCreate} />
          </form>
        ) : (
          <button type="button" className="fav-add" onClick={() => { setCreating(true); setDraftName(""); }}>＋ 新建收藏夹</button>
        )}
      </div>

      {activeCustomFolder && (
        <div className="fav-folder-actions">
          {renaming ? (
            <form className="fav-inline-form" onSubmit={submitRename}>
              <input autoFocus value={renameDraft} maxLength={40} aria-label="重命名收藏夹" onChange={(event) => setRenameDraft(event.target.value)} onBlur={submitRename} />
            </form>
          ) : (
            <button type="button" onClick={() => { setRenaming(true); setRenameDraft(activeCustomFolder.name); }}>重命名</button>
          )}
          <button type="button" className="fav-danger" onClick={() => {
            if (window.confirm(`删除收藏夹「${activeCustomFolder.name}」？夹内域名会移回默认收藏，不会被删除。`)) {
              onRemoveFolder(activeCustomFolder.id);
              onSelectFolder(ALL_FOLDERS);
            }
          }}>删除收藏夹</button>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="fav-tags-filter" role="group" aria-label="标签筛选">
          <button type="button" className={selectedTag === "" ? "active" : ""} onClick={() => onSelectTag("")}>全部标签</button>
          {allTags.map((tag) => (
            <button type="button" key={tag} className={selectedTag === tag ? "active" : ""} onClick={() => onSelectTag(selectedTag === tag ? "" : tag)}># {tag}</button>
          ))}
        </div>
      )}

      <div className="fav-actions">
        <button type="button" onClick={onExportJson} disabled={!entries.length}>导出 JSON</button>
        <button type="button" onClick={onExportCsv} disabled={!entries.length}>导出 CSV</button>
        <button type="button" onClick={onImport}>导入</button>
        <button type="button" className="fav-danger" onClick={() => { if (entries.length && window.confirm("清空全部本地收藏？此操作不可撤销。")) onClear(); }} disabled={!entries.length}>清空</button>
      </div>
    </div>
  );
}
