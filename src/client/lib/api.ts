import type { ApiResponse } from "../../shared/types/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )wanmi_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !body?.success) {
    const error = body && !body.success ? body.error : null;
    throw new ApiError(error?.message ?? `请求失败（${response.status}）`, error?.code ?? "HTTP_ERROR", response.status, error?.details);
  }
  return body.data;
}

export async function download(url: string): Promise<void> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiResponse<never> | null;
    throw new ApiError(body && !body.success ? body.error.message : "下载失败", body && !body.success ? body.error.code : "DOWNLOAD_FAILED", response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "WanMi-export.csv";
  const anchor = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
