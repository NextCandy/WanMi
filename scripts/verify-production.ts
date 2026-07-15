export {};

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
}

interface PublicList {
  total: number;
  items: Array<{ id: number; domain: string; is_featured: boolean; description: string }>;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function splitSetCookies(headers: Headers): string[] {
  const compatible = headers as Headers & { getSetCookie?: () => string[] };
  const direct = compatible.getSetCookie?.();
  if (direct?.length) return direct;
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

function cookieValue(setCookies: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return setCookies
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .split(";", 1)[0];
}

async function responseText(response: Response, label: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${label} 返回 HTTP ${response.status}`);
  return body;
}

async function api<T>(origin: string, path: string, init?: RequestInit): Promise<{ data: T; response: Response }> {
  const response = await fetch(`${origin}${path}`, { redirect: "error", ...init });
  const text = await response.text();
  let envelope: ApiEnvelope<T>;
  try {
    envelope = JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${init?.method ?? "GET"} ${path} 未返回 JSON（HTTP ${response.status}）`);
  }
  if (!response.ok || !envelope.success) {
    throw new Error(`${init?.method ?? "GET"} ${path} 失败（HTTP ${response.status}，${envelope.error?.code ?? "UNKNOWN"}）`);
  }
  return { data: envelope.data, response };
}

async function eventually<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  message: string,
  timeoutMs = 12_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;
  let lastError: unknown;
  do {
    try {
      lastValue = await read();
      if (matches(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  if (lastError instanceof Error) throw lastError;
  if (typeof lastError === "string") throw new Error(lastError);
  throw new Error(message);
}

const origin = (process.env.WANMI_ORIGIN ?? "https://wanmi.org").replace(/\/$/, "");
const write = process.argv.includes("--write");

const [health, settings, domains, facets, rootResponse, detailResponse, sitemapResponse, adminResponse] = await Promise.all([
  api<{ status: string; service: string }>(origin, "/api/health"),
  api<{ accent_color: string }>(origin, "/api/public/settings"),
  api<PublicList>(origin, "/api/public/domains?pageSize=1"),
  api<{ total: number }>(origin, "/api/public/facets"),
  fetch(`${origin}/`, { redirect: "error" }),
  fetch(`${origin}/d/wanmi.org`, { redirect: "error" }),
  fetch(`${origin}/sitemap.xml`, { redirect: "error" }),
  fetch(`${origin}/admin`, { redirect: "error" }),
]);

const [rootHtml, detailHtml, sitemapXml] = await Promise.all([
  responseText(rootResponse, "首页"),
  responseText(detailResponse, "详情页"),
  responseText(sitemapResponse, "站点地图"),
]);
invariant(adminResponse.ok, `/admin 返回 HTTP ${adminResponse.status}`);
invariant(health.data.status === "ok", "健康检查状态不是 ok");
invariant(domains.data.total >= 859, "公开域名数量异常");
invariant(facets.data.total === domains.data.total, "列表与分类统计不一致");
invariant(rootHtml.includes('"@type":"ItemList"'), "首页缺少 ItemList JSON-LD");
invariant(rootHtml.includes(`"numberOfItems":${domains.data.total}`), "首页 JSON-LD 数量不是实时值");
invariant(rootHtml.includes(`<link rel="canonical" href="${origin}/"`), "首页 canonical 不正确");
invariant(detailHtml.includes('"@type":"WebPage"'), "详情页缺少 WebPage JSON-LD");
invariant(!detailHtml.includes('"@type":"Product"'), "详情页仍包含无真实报价的 Product JSON-LD");
invariant(sitemapXml.includes(`${origin}/d/wanmi.org`), "站点地图缺少 wanmi.org");

const report: Record<string, unknown> = {
  origin,
  health: health.data.status,
  publicDomains: domains.data.total,
  accentColor: settings.data.accent_color,
  seo: { itemList: true, liveCount: true, canonical: true, detailWebPage: true, sitemap: true },
};

if (write) {
  invariant(origin === "https://wanmi.org" || process.env.WANMI_ALLOW_WRITE_ORIGIN === "1", "非生产域名写入需显式设置 WANMI_ALLOW_WRITE_ORIGIN=1");
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  invariant(email && password, "写入冒烟需要 ADMIN_EMAIL 与 ADMIN_PASSWORD");

  const login = await api<{ user: { id: number } }>(origin, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  const setCookies = splitSetCookies(login.response.headers);
  const session = cookieValue(setCookies, "wanmi_session");
  const csrfCookie = cookieValue(setCookies, "wanmi_csrf");
  invariant(session && csrfCookie, "登录响应缺少安全 Cookie");
  const csrf = decodeURIComponent(csrfCookie);
  const authenticatedHeaders = { Cookie: `wanmi_session=${session}; wanmi_csrf=${csrfCookie}` };
  const writeHeaders = { ...authenticatedHeaders, Origin: origin, "X-CSRF-Token": csrf, "Content-Type": "application/json" };
  const nonce = Date.now().toString(36);
  const temporaryDomain = `codex-qa-${nonce}.com`;
  const previewDomain = `codex-preview-${nonce}.com`;
  let temporaryId: number | undefined;
  let smokeFailure: unknown;
  let cleanupFailure: unknown;
  const checks = { created: false, publicSync: false, bulkFeature: false, bulkHideList: false, csvPreview: false, selectedExport: false, actorLog: false, cleaned: false, loggedOut: false };

  try {
    const created = await api<{ id: number }>(origin, "/api/admin/domains", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({ fullDomain: temporaryDomain, description: "生产冒烟临时记录，完成后自动清理", isListed: true }),
    });
    temporaryId = created.data.id;
    checks.created = Number.isInteger(temporaryId) && temporaryId > 0;

    await eventually(
      async () => (await api<PublicList>(origin, `/api/public/domains?q=${encodeURIComponent(temporaryDomain)}&probe=${Date.now()}`)).data,
      (value) => value.total === 1 && value.items[0]?.description.startsWith("生产冒烟") === true,
      "新建域名未同步到公开 API",
    );
    checks.publicSync = true;

    const featured = await api<{ changed: number }>(origin, "/api/admin/domains/bulk", {
      method: "POST", headers: writeHeaders, body: JSON.stringify({ ids: [temporaryId], action: "feature" }),
    });
    invariant(featured.data.changed >= 1, "批量精品没有更新记录");
    await eventually(
      async () => (await api<PublicList>(origin, `/api/public/domains?q=${encodeURIComponent(temporaryDomain)}&probe=${Date.now()}`)).data,
      (value) => value.items[0]?.is_featured === true,
      "批量精品未映射到公开 API",
    );
    checks.bulkFeature = true;

    await api<{ changed: number }>(origin, "/api/admin/domains/bulk", {
      method: "POST", headers: writeHeaders, body: JSON.stringify({ ids: [temporaryId], action: "hide" }),
    });
    await eventually(
      async () => (await api<PublicList>(origin, `/api/public/domains?q=${encodeURIComponent(temporaryDomain)}&probe=${Date.now()}`)).data,
      (value) => value.total === 0,
      "批量隐藏未同步到公开 API",
    );
    await api<{ changed: number }>(origin, "/api/admin/domains/bulk", {
      method: "POST", headers: writeHeaders, body: JSON.stringify({ ids: [temporaryId], action: "list" }),
    });
    await eventually(
      async () => (await api<PublicList>(origin, `/api/public/domains?q=${encodeURIComponent(temporaryDomain)}&probe=${Date.now()}`)).data,
      (value) => value.total === 1,
      "批量恢复未同步到公开 API",
    );
    checks.bulkHideList = true;

    const previewForm = new FormData();
    previewForm.append("file", new Blob([`Domain,TLD\n${temporaryDomain},com\n${previewDomain},com\n`], { type: "text/csv" }), "production-preview.csv");
    previewForm.append("dryRun", "true");
    const preview = await api<{ preview: { newRows: number; existingRows: number } }>(origin, "/api/admin/domains/import", {
      method: "POST",
      headers: { ...authenticatedHeaders, Origin: origin, "X-CSRF-Token": csrf },
      body: previewForm,
    });
    checks.csvPreview = preview.data.preview.newRows === 1 && preview.data.preview.existingRows === 1;
    invariant(checks.csvPreview, "CSV 预览未正确区分新增与冲突");

    const exportResponse = await fetch(`${origin}/api/admin/domains/export?ids=${temporaryId}`, { headers: authenticatedHeaders, redirect: "error" });
    const exportCsv = await responseText(exportResponse, "所选域名导出");
    checks.selectedExport = exportCsv.includes(temporaryDomain);
    invariant(checks.selectedExport, "所选域名导出缺少临时记录");

    const logs = await api<{ items: Array<{ actor_email: string; action: string }> }>(origin, "/api/admin/logs?action=domains.bulk.feature&pageSize=10", { headers: authenticatedHeaders });
    checks.actorLog = logs.data.items.some((item) => item.action === "domains.bulk.feature" && item.actor_email === email);
    invariant(checks.actorLog, "批量操作日志缺少操作者");
  } catch (error) {
    smokeFailure = error;
  } finally {
    if (temporaryId) {
      try {
        await api<{ deleted: boolean }>(origin, `/api/admin/domains/${temporaryId}`, { method: "DELETE", headers: writeHeaders });
        await eventually(
          async () => {
            const [afterDelete, afterCount] = await Promise.all([
              api<PublicList>(origin, `/api/public/domains?q=${encodeURIComponent(temporaryDomain)}&probe=${Date.now()}`),
              api<PublicList>(origin, `/api/public/domains?pageSize=1&probe=${Date.now()}`),
            ]);
            return { deletedTotal: afterDelete.data.total, total: afterCount.data.total };
          },
          (value) => value.deletedTotal === 0 && value.total === domains.data.total,
          "临时域名清理后数量未恢复",
        );
        checks.cleaned = true;
      } catch (error) {
        cleanupFailure = error;
      }
    }
    try {
      await api<{ loggedOut: boolean }>(origin, "/api/auth/logout", { method: "POST", headers: writeHeaders });
      checks.loggedOut = true;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }

  if (smokeFailure || cleanupFailure) {
    const messages = [smokeFailure, cleanupFailure]
      .filter(Boolean)
      .map((error) => error instanceof Error ? error.message : String(error));
    throw new Error(`生产写入冒烟失败：${messages.join("；")}`);
  }
  report.writeSmoke = checks;
}

console.log(JSON.stringify(report, null, 2));
