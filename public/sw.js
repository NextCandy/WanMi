/*
 * 玩米 PWA Service Worker
 * 策略要点（务必遵守产品约束）：
 *  - 导航(HTML)：网络优先，失败回退到缓存的应用外壳（离线也能打开基础界面）。
 *  - 静态资源(/assets 哈希文件、图标、字体)：stale-while-revalidate。
 *  - 公开 API：网络优先，仅在离线时回退到上次成功响应；绝不做固定 30 分钟缓存。
 *  - 后台 / 认证 / 统计埋点 API：一律 network-only，永不缓存。
 *  - 收藏、备注、标签存于 localStorage，与 SW 无关，离线天然可读。
 * 改动缓存逻辑时请同步提升 VERSION 以触发旧缓存清理。
 */
const VERSION = "wanmi-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const API_CACHE = `${VERSION}-api`;
const SHELL_URL = "/";
const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/assets/")
    || /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)$/.test(url.pathname)
    || url.hostname === "fonts.googleapis.com"
    || url.hostname === "fonts.gstatic.com";
}

// 网络优先：拿到成功响应就更新缓存；离线时回退缓存
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === "GET") cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const shell = await caches.match(fallbackUrl);
      if (shell) return shell;
    }
    throw error;
  }
}

// stale-while-revalidate：先给缓存，后台顺带刷新
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // 写操作不拦截
  const url = new URL(request.url);

  // 后台 / 认证 / 统计埋点：绝不缓存，直接放行网络
  if (url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/track") || url.pathname.startsWith("/uploads/")) {
    return;
  }

  // 导航请求：网络优先，离线回退到应用外壳
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, SHELL_URL));
    return;
  }

  // 公开 API：网络优先，离线才回退上次成功响应（非固定时长缓存）
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/public/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 静态资源与字体：stale-while-revalidate
  if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});

// 允许页面在部署新版本后主动触发即时接管
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
