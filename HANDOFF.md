# WanMi HANDOFF

## 当前任务

将 Claude Design 导出的 DS 原型重构为可部署到 Cloudflare Workers 的 WanMi 全栈域名展示与管理系统，导入用户提供的 662 个真实域名。

## 原仓库问题

原仓库只有两个 `.dc.html`、空 README 和 `support.js`。前后台各自硬编码域名；登录不验证；同步、DNS、通知和导出均为浏览器模拟；示例注册商、联系方式、日志和到期日期刷新后丢失。

## 已完成

- 单 Worker 的 React + Vite + Hono + D1 + R2 + Cron 架构。
- 真实 PBKDF2 管理员登录、HMAC 会话/CSRF、限流、改密和会话撤销。
- D1 完整 schema、24 列 CSV 解析、662 条本地导入和幂等验证。
- 中文前台搜索/筛选/分页/复制/联系和中文后台管理。
- 域名 CRUD、批量操作、原子导入、真实 CSV 导出、错误行下载。
- 六家注册商适配器、AES-GCM 凭据、真实 DNS 读写和逐项批量结果。
- D1 站点设置、R2 图片、真实通知测试、到期 Cron、日志和同步记录。
- 单元、集成和 Playwright E2E；原型移入 `docs/design-reference/` 且生产不依赖。

## CSV 导入统计

源：`data/source/domains-1783619533.csv`

原始 662、解析 662、唯一 662、重复 0、无效 0、D1 域名 662、售卖平台记录 0、公开展示 662。导入仅使用域名和后缀。

## D1 表

`admin_users`、`admin_sessions`、`auth_login_attempts`、`domains`、`domain_marketplace_listings`、`registrar_accounts`、`dns_records_cache`、`site_settings`、`notification_settings`、`operation_logs`、`sync_runs`、`notification_deliveries`、`domain_import_staging`、`domain_import_errors`。

## Cloudflare 资源

Worker `wanmi`，D1 `wanmi-db`（绑定 `DB`），R2 `wanmi-assets`（绑定 `UPLOADS`），Static Assets `ASSETS`，Cron `0 1 * * *`。本地和远程 migration、导入均已完成。

生产 URL：<https://wanmi.1n.workers.dev>

远程 D1 已连续执行两次幂等导入，最终为域名 662、市场记录 662、公开展示 662；R2 Bucket 位于 APAC，Worker Secret 已通过 Wrangler 安全上传。生产浏览器和 API 冒烟均通过。

## 测试结果

- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm test`：6 文件、29 项通过；覆盖 CSV API dry-run、重复域名、精品排序和 DNS 失败不改缓存。
- `pnpm test:e2e`：Chromium 2 项通过；隐藏的真实域名已恢复。
- `pnpm build`：通过；构建 Secret 安全扫描通过。
- `pnpm domains:verify`：662/662/662 通过；重复导入仍为 662。
- `pnpm verify:no-demo-data`：62 个生产文件通过。
- 生产 API：错误密码 401、真实登录、后台 662、隐藏/恢复、退出及旧会话 401 全部通过。
- 生产浏览器：前台 662、搜索 `wanmi.org`、`/admin` 刷新、登录、概览和退出通过。

## Git

分支：`codex/wanmi-cloudflare`。

本地分阶段提交：

- `89179b1` `chore: initialize WanMi Cloudflare workspace`
- `7cf7e43` `feat: add D1 schema and secure admin authentication`
- `615c160` `feat: import all 662 domains into D1`
- `b47b0e3` `feat: build D1-backed public domain catalog`
- `6ccda59` `feat: add admin CRUD settings and notifications`
- `a5c3aec` `feat: add registrar sync and real DNS adapters`
- `0f8898d` `test: cover auth imports API and browser flows`
- `c59b243` `test: enforce DNS cache and acceptance invariants`

最终文档提交见当前分支最新提交。因本机没有 `gh`，尚未推送，也未创建 Pull Request。

## 尚未完成 / 当前阻塞

1. 本机没有 GitHub CLI `gh`，GitHub 发布技能要求在推送/PR 前具备已认证的 `gh`。
2. 六家注册商适配器没有用户真实凭据，已实现真实 API 路径但未做线上连接实测。

## 下一步

1. 安装并登录 `gh`，推送当前分支并创建 draft PR。
2. 为实际使用的注册商配置最小权限凭据，执行连接、只读同步和非关键 DNS CRUD 冒烟。
3. 如决定删除一次性引导密码 Secret，先确认管理员仍可登录并同步调整后续部署 Secret 清单。

## 已踩过且不能重复的坑

- `csv-parse/sync` Node 入口依赖 Buffer，Workers 必须使用 `csv-parse/browser/esm/sync`。
- Wrangler 直接执行包含完整原始 JSON 的超大 SQL 文件会触发 `SQLITE_TOOBIG`；本地必须对 Miniflare D1 SQLite 使用事务，远程使用 D1 batch API。
- Cloudflare Vite Plugin 预览输出可能复制 `.dev.vars`；构建后必须清理并扫描泄漏。
- Playwright 页面不应依赖远程字体；外部字体可导致 `load` 等待和测试抖动。
- CSV Listing Status 不能用作 WanMi 的展示开关；只有 Hidden 或管理员设置决定 `is_listed`。
- Cloudflare D1 Query API 的当前批量请求必须包装为 `{ batch: [...] }`，顶层数组会返回 code 7400。
- Cloudflare Workers Web Crypto 的 PBKDF2 上限为 100,000 次；更高迭代数会在生产返回 `NotSupportedError`。
