import { createMiddleware } from "hono/factory";

import type { AppBindings } from "../types";

/**
 * 公开只读接口的 Cloudflare 边缘缓存。
 * 跨境用户到 Worker 的一次往返实测 1 秒以上；命中边缘 POP 后只剩一次轻量
 * version 主键查询。缓存键携带 public_data_version（domains 与 site_settings
 * 的触发器负责自增），后台任何改动都会让下一个请求换键直读新数据——
 * s-maxage 只决定同版本条目的边缘存活时长，不再是数据陈旧上限。
 * 浏览器层保持 max-age=0 must-revalidate，本地始终回源验证。
 */
export const edgeCache = createMiddleware<AppBindings>(async (c, next) => {
  if (c.req.method !== "GET" || typeof caches === "undefined") return next();
  // tsconfig 同时服务前端（DOM lib）与 Worker：DOM 的 CacheStorage 没有 default，
  // 运行时实际是 Workers 的 caches.default，此处仅做类型收窄。
  const cache = (caches as unknown as { default: Cache }).default;
  const version = await c.env.DB.prepare(
    "SELECT version || ':' || COALESCE(updated_at, '') AS v FROM public_data_version WHERE id = 1",
  ).first<{ v: string }>().catch(() => null);
  const keyUrl = new URL(c.req.url);
  keyUrl.searchParams.set("__pv", version?.v ?? "0");
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, hit);

  await next();

  const cacheControl = c.res.headers.get("Cache-Control") ?? "";
  if (c.res.ok && cacheControl.includes("s-maxage")) {
    try {
      c.executionCtx.waitUntil(cache.put(key, c.res.clone()));
    } catch {
      // 测试环境没有 executionCtx / Cache API 写入能力时静默跳过。
    }
  }
});

/** 可被边缘缓存 60 秒、浏览器端仍强制回源验证的公开数据响应头 */
export const PUBLIC_CACHE_CONTROL = "public, max-age=0, must-revalidate, s-maxage=60";
