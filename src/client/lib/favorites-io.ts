import { DEFAULT_FOLDER_ID, type FavoriteEntry, type FavoriteFolder } from "../hooks/useDomainFavorites";

/** 触发浏览器下载一个本地生成的文本文件（收藏导出，纯本地，不经服务器） */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function csvCell(value: string): string {
  // 逗号/引号/换行需要加引号并转义
  const needsQuote = /[",\n\r]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/** 收藏导出为简单列表 CSV（域名 / 收藏夹 / 标签 / 备注 / 精品 / 收藏时间），前置 UTF-8 BOM 兼容 Excel */
export function favoritesToCsv(entries: FavoriteEntry[], folders: FavoriteFolder[]): string {
  const folderName = new Map<string, string>([[DEFAULT_FOLDER_ID, "默认收藏"], ...folders.map((folder) => [folder.id, folder.name] as const)]);
  const header = ["域名", "收藏夹", "标签", "备注", "精品", "收藏时间"];
  const rows = entries.map((entry) => [
    entry.domain.domain,
    folderName.get(entry.folderId) ?? "默认收藏",
    entry.tags.join(" / "),
    entry.note.replace(/\r?\n/g, " "),
    entry.domain.is_featured ? "是" : "否",
    new Date(entry.createdAt).toLocaleString("zh-CN"),
  ]);
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(","));
  // 前置 UTF-8 BOM（运行时生成，源码不含不可见字符），兼容 Excel 打开中文
  return String.fromCharCode(0xFEFF) + lines.join("\r\n");
}

/** 读取用户选择的导入文件并解析为 JSON；解析失败抛错交由调用方提示 */
export async function readImportFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}
