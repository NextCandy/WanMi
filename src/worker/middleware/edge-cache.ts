import { createMiddleware } from "hono/factory";

import type { AppBindings } from "../types";

/** 由 vite define 注入；测试等未经打包的环境回退成固定值 */
const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

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
  // 站点设置会直接影响联系方式、Logo 等即时可见内容；后台保存后必须绕过
  // 浏览器与 Cache API 的旧条目，避免不同 POP 继续返回修改前的数据。
  if (new URL(c.req.url).pathname === "/api/public/settings") return next();
  // tsconfig 同时服务前端（DOM lib）与 Worker：DOM 的 CacheStorage 没有 default，
  // 运行时实际是 Workers 的 caches.default，此处仅做类型收窄。
  const cache = (caches as unknown as { default: Cache }).default;
  const version = await c.env.DB.prepare(
    "SELECT version || ':' || COALESCE(updated_at, '') AS v FROM public_data_version WHERE id = 1",
  ).first<{ v: string }>().catch(() => null);
  const keyUrl = new URL(c.req.url);
  keyUrl.searchParams.set("__pv", version?.v ?? "0");
  // 数据版本只在数据改动时自增，改排序、序列化这类纯代码逻辑不会碰它。
  // 再带上构建标识，部署后立刻换键，不必等 s-maxage 到期。
  keyUrl.searchParams.set("__bv", BUILD_ID);
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
