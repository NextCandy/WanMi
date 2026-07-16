# 玩米（WanMi）

玩米是部署在 Cloudflare Workers 上的中文域名展示与管理系统。公开站点用于检索、收藏、速览和访问已上架域名；管理后台负责域名、分类、CSV、站点设置、到期提醒、通知、安全与审计日志。前端、Worker API、Cloudflare D1 与 R2 同源部署。

## 线上环境

- 生产站点：<https://wanmi.org>
- 管理后台：<https://wanmi.org/admin>
- Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- Workers AI：绑定 `AI`，用于生成可编辑的域名关键词建议
- Cron：每天 `01:00 UTC`，即 `Asia/Shanghai 09:00`
- 当前设计基线：单一黑金主题（2026-07-16）

权威业务源为 `data/source/WanMi.csv`：859 条有效唯一记录。生产库还保留 3 条历史人工域名，因此线上合计 862 条；本次迁移与发布不得覆盖或归档这 3 条记录。

## 产品边界

当前产品明确不包含以下能力：

- 求购表单、报价、线索存储及相关 API；
- DNS 查询、缓存、写入和管理界面；
- 注册商账户、凭据、同步及服务商适配器。

域名可保留 `registrar_name` 纯文字资料，用于记录该域名的注册商名称，但它不关联账户或外部 API。旧版相关端点均返回 404；`0016_remove_registrar_dns_leads.sql` 会删除历史表与关联字段，同时保留域名、分类、通知历史和注册商文字资料。

## 设计系统

- 仅提供单一黑金主题，不提供明暗主题切换，也不读取系统配色偏好。
- 根目录 `tokens.css` 是唯一设计令牌源；组件与运行时样式只引用 CSS 变量，不硬编码色值。
- 背景使用纯黑 OLED `#000000`，表面依次使用 `#151515`、`#1a1a1a`、`#1e1e1e`，唯一强调色为香槟金 `#d8b638`。
- 主、次、三级文字依次使用 `#f5f5f7`、`#a1a1a6`、`#6e6e73`。
- 保留 `prefers-reduced-motion` 与 `prefers-reduced-transparency` 退化；完整规范见 [`design.md`](design.md)。

## 公开站点

- 搜索与筛选：关键词、后缀、分类、精品、长度、包含/排除字符和域名类型，状态同步到 URL。
- 搜索按钮固定为右侧 72px 紧凑按钮，不再拉伸占据工具栏。
- 每张域名卡片底部仅保留收藏、复制、速览三枚图标；无可见中文按钮文字，也没有“我想要”。
- 点击域名名称直接在新标签页访问对应域名；站内保留原生 `dialog` 速览。
- 收藏和最近搜索仅保存在当前浏览器的版本化 `localStorage` 中。
- 单一黑金主题、随机发现、相似域名、桌面/平板/手机响应式布局与无障碍标签。
- Worker 为首页注入 canonical、Open Graph 和真实域名 `ItemList` JSON-LD；旧 `/d/:name` 只重定向到首页搜索。

## 性能策略

- 公开列表默认每页 36 条，服务端分页；不预取下一页。
- 最近请求缓存最多 20 项，失败请求自动移出缓存。
- 数据版本检查从 8 秒降为 60 秒，并且只在页面可见时执行；后台修改可通过刷新立即读取。
- 卡片使用 `React.memo`、`content-visibility` 与布局隔离；关闭卡片入场动画、重阴影、位移悬停和移动底栏模糊。
- 管理后台按路由懒加载，不进入公开首页首包。

## 管理后台

后台固定为七个模块：概览、域名、分类、站点设置、到期提醒、账户安全、操作日志。

- PBKDF2 密码、HMAC 会话、CSRF、防暴力登录、会话撤销与改密；
- 域名 CRUD、服务端筛选/排序/分页、卡片关键词、可选简介、生命周期文字资料、精品、上架状态和批量操作；支持批量设置关键词，以及通过 Workers AI 生成 2–4 个可编辑的中文关键词建议；
- CSV 预览、关键词导入导出、跳过/更新冲突及导入错误下载；
- 站点资料和 R2 图片；
- Email、Telegram、Bark、Server酱、企业微信、飞书、Discord 通知；
- 操作日志筛选、分页与 CSV 导出。

## 技术栈

React 19、TypeScript 6、Vite 8、Cloudflare Vite Plugin、Hono、Workers Static Assets、D1、R2、Cron Triggers、Zod、Vitest 和 Playwright。

## 本地开发

要求 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm domains:validate
pnpm domains:import:local -- --dry-run
pnpm domains:import:local
pnpm dev --host 127.0.0.1
```

本地 Vite 默认关闭 Cloudflare 远程 binding 代理，避免开发与 CI 依赖线上凭据；Workers AI 端点由集成测试注入 mock，真实推理由已部署 Worker 的 `AI` binding 执行。

`.dev.vars` 必须提供 `ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`SESSION_SECRET` 和 `CREDENTIALS_ENCRYPTION_KEY`，且已被 Git 忽略。首次使用某个管理员邮箱登录时才会创建该账号；部署不会重置已有密码。

## 验证与部署

```bash
pnpm check
pnpm test:e2e

pnpm exec wrangler whoami
pnpm db:backup
pnpm db:migrate:remote
pnpm run deploy
pnpm verify:production
```

`pnpm check` 包含类型检查、ESLint、单元/集成测试、生产构建、859 条本地域名验证和生产文件扫描。生产变更顺序固定为：完整 D1 备份 → 检查待执行迁移 → 远程迁移 → 部署 → API、桌面、手机和后台验收。

本轮关键迁移：

- `0015_restore_domain_management_schema.sql`：仅作为历史列名兼容桥，为全新安装准备临时文字列并回填权威 CSV；不会恢复被移除的业务表。
- `0016_remove_registrar_dns_leads.sql`：兼容历史线上和全新安装两种 schema，规范化 `registrar_name`，重建导入暂存表，删除注册商账户、DNS 和求购线索表，并保护分类与通知历史。
- `0017_domain_keywords_field.sql`：为域名和导入暂存记录增加逗号分隔关键词，按中英文逗号与顿号迁移有效简介，同时完整保留原 `description`。

所有远程 Token 只能通过环境变量、CI Secret 或交互式输入提供。不得写入 README、`.dev.vars.example`、Wrangler 配置、构建产物、Issue 或日志；聊天中暴露过的长期凭据应在发布后轮换。

## 目录

```text
src/client/            React 公开站点与管理后台
src/worker/            Hono Worker、认证、API 与通知服务
src/shared/            CSV、导入计划、Schema 和共享类型
scripts/               数据导入、验证、备份与安全扫描
migrations/            D1 migrations
data/source/           权威 CSV
tests/                 单元、集成与 Playwright E2E
docs/                  部署、导入与安全文档
```

详细说明见 [Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md)、[安全设计](docs/SECURITY.md)、[设计规范](design.md) 与 [HANDOFF](HANDOFF.md)。
