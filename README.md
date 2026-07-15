# 玩米（WanMi）

玩米是部署在 Cloudflare Workers 上的中文域名展示与管理系统。公开站点用于检索、收藏和发现已上架域名；管理后台负责域名、分类、CSV、求购线索、站点设置、通知及审计日志。前后端与 API 同源，共享 Cloudflare D1，图片使用 R2。

## 线上环境

- 生产站点：<https://wanmi.org>
- 管理后台：<https://wanmi.org/admin>
- Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- Cron：每天 `01:00 UTC`，即 `Asia/Shanghai 09:00`

唯一业务源文件为 `data/source/WanMi.csv`：原始 859 条、有效唯一 859 条、重复 0、无效 0。导入脚本保留历史记录，并支持幂等同步。

## 公开站点

- 黑金目录视觉：紧凑 Hero、实时域名总数、分类构成、精品优先卡片、深浅色主题与克制动效。
- 搜索与高级筛选：关键词、后缀、分类、精品、长度区间、包含字符、排除字符和域名类型；状态写入 URL，可刷新和分享。
- 本地收藏：收藏内容仅保存在当前浏览器的版本化 `localStorage` 中，不上传服务器；支持收藏视图和详情页同步切换。
- 搜索历史：最多保留 10 条，去重并支持逐条复用或清空；存储异常时自动降级，不影响检索。
- 域名速览：在当前页查看注册日期、到期日期、分类和相似域名，可直接复制、收藏、联系或打开完整详情。
- 随机发现与相似推荐：只从已加载的真实公开数据中选择；推荐按后缀、分类、长度和前缀在客户端确定性计算。
- 性能：后台与详情页按路由拆包，公开列表缓存最近页面并在网络条件允许时预取下一页，长列表使用 `content-visibility`。
- SEO：Worker 为首页注入实时站点元数据和真实域名 `ItemList` JSON-LD；详情页使用 `WebPage` 结构化数据，不伪造价格或库存。
- 可访问性：语义化卡片、原生 `dialog`、键盘焦点环、减少动效/透明度/高对比度偏好和安全区适配。

## 响应式设计

- 桌面：多列卡片、数字分页和完整操作区。
- 平板：自适应列数，筛选与工具栏重排。
- 手机：单列卡片、底部固定导航、详情底部抽屉、至少 44px 触控目标，并处理 `env(safe-area-inset-bottom)`。
- 自动化覆盖 `1280×720`、`1440×900`、`1920×1080`、`768×1024`、`1024×768`、`320×568`、`375×812`、`390×844` 和 `430×932`，检查主内容与横向溢出。

## 管理后台

- 安全认证：PBKDF2 密码、HMAC 会话、CSRF、防暴力登录、会话查看/撤销与改密。
- 域名管理：CRUD、服务端筛选/排序/分页、简介与精品切换、隐藏/恢复、分类及批量设置。
- CSV 导入预览：上传后先展示总数、有效、无效、重复、新增、已存在、示例记录和错误行；冲突可选择“跳过”或“更新”。正式导入会在服务端重新解析与验证，后台上传不会归档未出现在本次文件中的域名。
- CSV 导出：支持全部或所选记录；原始业务 CSV 的同步脚本仍保持权威归档语义。
- 批量管理：对选中域名批量上架/下架、设为/取消精品、分类和导出，并返回逐项结果。
- 操作日志：按级别、动作、关键词和日期筛选，显示结果、时间、动作、对象、操作者和消息，支持分页与导出。
- 数据同步：所有写操作由 D1 触发器递增数据版本；已打开的前台定期检查版本并刷新缓存。
- 其余能力：求购线索、统计仪表盘、站点设置、R2 图片、到期提醒、通知渠道、注册商账户及 DNS 适配器。

## 技术栈

React 19、TypeScript 6、Vite 8、Cloudflare Vite Plugin、Hono、Cloudflare Workers Static Assets、D1、R2、Cron Triggers、Zod、Vitest 和 Playwright。

## 本地开发

要求 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm domains:validate
pnpm domains:import:local -- --dry-run
pnpm domains:import:local
pnpm domains:verify
pnpm dev
```

`.dev.vars` 必须填写 `ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`SESSION_SECRET` 和 `CREDENTIALS_ENCRYPTION_KEY`，且已被 Git 忽略。首次登录时 Worker 才会创建管理员；管理员已存在时重新部署不会重置密码。

## 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm check

pnpm db:migrate:local
pnpm db:migrate:remote
pnpm db:backup
pnpm db:restore:removed-records -- --backup=<历史备份.sql> --dry-run

pnpm domains:validate
pnpm domains:import:local -- --dry-run
pnpm domains:verify
pnpm verify:no-demo-data
pnpm verify:production
pnpm verify:production -- --write
```

集成测试使用 Node.js 内置 `node:sqlite` 模拟 D1，不依赖系统安装的 `sqlite3` 命令行工具。
`pnpm verify:production` 默认只读；只有显式增加 `-- --write` 并通过环境变量提供管理员凭据时，才会创建一个唯一临时域名，验证批量操作、CSV 预览、导出和日志，并在 `finally` 中删除临时记录。

## 生产迁移与部署

```bash
pnpm wrangler whoami
pnpm db:backup
pnpm db:migrate:remote
pnpm check
pnpm run deploy
pnpm domains:verify -- --remote
```

`pnpm db:backup` 会把远程 D1 导出到被 Git 忽略的 `backups/`。本轮新增两项迁移：

- `0014_black_gold_accent.sql`：仅当站点仍使用历史默认橙色时将主题色改为金色，管理员自定义颜色不会被覆盖。
- `0015_restore_domain_management_schema.sql`：兼容曾执行过旧版破坏性迁移的生产库，幂等恢复注册商账户、DNS 缓存和求购线索表，并增加不会与旧列冲突的 `registrar_label`、`registrar_account_ref` 字段；同时从权威 CSV 回填 859 条注册商标签，不删除、不归档域名。

如果远程库曾被历史迁移移除注册商或线索记录，应先对旧备份运行 `db:restore:removed-records --dry-run`，确认数量后再提供 `CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID` 和 `CLOUDFLARE_API_TOKEN` 执行正式恢复。恢复脚本只写回目标表及域名账户关联，不输出加密凭据或联系人内容。

2026-07-15 的生产验收状态：Worker 版本 `5558ddff-1b91-4525-8c83-77039eab472e`，D1 共 862 条域名、862 条公开、87 条精品；859 条权威 CSV 域名已回填注册商标签，历史备份中的 2 条注册商账户和 1 条求购线索已恢复。只读与可回滚写入冒烟、桌面/移动端真实浏览器验收均通过，临时测试域名已删除。首页由 Worker 优先处理以注入实时 SEO，其他静态资源仍由 Workers Static Assets 提供。

远程 API Token 只能通过 `CLOUDFLARE_API_TOKEN`、`GH_TOKEN`/`GITHUB_TOKEN` 等环境变量或 CI Secret 注入。Worker Secret 使用 `wrangler secret put` 设置。真实凭据不得进入 README、环境变量示例、Wrangler 配置、构建产物或日志；一旦出现在聊天或终端历史中应立即撤销并轮换。

## 目录

```text
src/client/            React 公开站点与管理后台
src/worker/            Hono Worker、认证、API 与服务商适配器
src/shared/            CSV、导入计划、Schema 和共享类型
scripts/               数据导入、验证、备份与安全扫描
migrations/            D1 migrations
data/source/           唯一原始 CSV
tests/                 单元、集成与 Playwright E2E
docs/                  部署、导入、安全与适配器文档
```

详细说明见 [Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md)、[注册商适配器](docs/REGISTRAR_PROVIDERS.md)、[安全设计](docs/SECURITY.md) 与 [HANDOFF](HANDOFF.md)。
