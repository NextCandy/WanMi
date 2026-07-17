# 玩米（WanMi）

玩米是部署在 Cloudflare Workers 上的中文域名展示与管理系统。公开站点用于检索、收藏、速览和访问已上架域名；管理后台负责域名、分类、CSV、站点设置、到期提醒、通知、安全与审计日志。前端、Worker API、Cloudflare D1 与 R2 同源部署。

## 线上环境

- 生产站点：<https://wanmi.org>
- 管理后台：<https://wanmi.org/admin>
- Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- AI 简介：后台可保存多个 DeepSeek / OpenAI 兼容配置，API Key 以 AES-GCM 加密存入 D1
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

- 搜索与筛选：关键词、后缀、分类、精品、位数（全部、1–9 位与 10 位以上，与高级筛选共用 minLength/maxLength）、包含/排除字符和域名类型，状态同步到 URL；旧链接的 `group=two/three` 解析时自动转换。
- 首页 Hero（域名总数）之后直接是全部资产列表，无独立精选区块；精品域名以主列表卡片上的精品标记区分。
- 搜索按钮固定为右侧 72px 紧凑按钮，不再拉伸占据工具栏。
- 每张域名卡片底部仅保留收藏、复制、速览三枚图标；无可见中文按钮文字，也没有“我想要”。
- 点击域名名称直接在新标签页访问对应域名；站内保留原生 `dialog` 速览，精品域名速览额外提供独立详情页入口。
- 收藏和最近搜索仅保存在当前浏览器的版本化 `localStorage` 中。
- 单一黑金主题、随机发现、相似域名、桌面/平板/手机响应式布局与无障碍标签。
- Worker 为首页注入 canonical、Open Graph 和真实域名 `ItemList` JSON-LD。
- 87 个精品域名拥有 Worker SSR 独立页 `/d/:domain`，包含完整资料、同后缀/同长度推荐、Open Graph 与 Product JSON-LD；普通域名访问该路径时重定向到 `/domains?q=域名`。
- `/api/public/og/:domain` 为精品域名生成 1200×630 黑底金字 PNG；`sitemap.xml` 从 D1 动态输出首页和全部 87 个精品详情页。

## 性能策略

- 样式按域拆分：`app.css` 为前台与共享层，`admin.css` 为后台专属层，随已懒加载的 `AdminApp` 按需加载，不进前台首屏（前台 CSS 135.93KB → 108.66KB，gzip 23.54 → 19.19KB）。
- Manrope（域名与 UI）与 IBM Plex Mono（元数据）已自托管 latin/latin-ext 子集（`public/fonts/`，`src/client/styles/fonts.css` 由 `pnpm fonts:fetch` 生成）：Google Fonts 在中国大陆不可达，外链会让国内用户完全拿不到这两族字体。Manrope 为变量字体，单文件覆盖 400-800，浏览器按 unicode-range 只下载命中的子集。中文 Noto Sans SC 体积过大仍走 Google Fonts，不可达时按 `tokens.css` 回退系统中文字体。
- 拆分依据是真实页面的 DOM 探测而非命名前缀：只有「前台完全不匹配、仅后台匹配」的选择器才进 `admin.css`。实测前后台共享选择器仅 19 个（`html`/`body`/`button`/`.brand`/`.secondary-button`/`.pagination` 等），全部留在 `app.css`；两个文件选择器不重叠，因此 `admin.css` 的加载顺序不影响前台层叠。注意 `.admin-link` 是前台页脚的管理入口，不可按前缀误判为后台样式。
- 后台域名列表每页 100 条服务端分页，滚动到底自动累积下一页；桌面按视口虚拟化渲染，行高由首行实测得出。
- 720px 以下表格切换为卡片式布局、行高不定，此时关闭虚拟化直接整段渲染；宽表格只在自身容器内横向滚动，页面本身不横向滚动。
- 后台搜索输入去抖 300ms，避免逐字符重置累积列表。
- 公开列表默认每页 36 条，服务端分页；不预取下一页。
- 最近请求缓存最多 20 项，失败请求自动移出缓存。
- 数据版本检查从 8 秒降为 60 秒，并且只在页面可见时执行；后台修改可通过刷新立即读取。
- 卡片使用 `React.memo`、`content-visibility` 与布局隔离；关闭卡片入场动画、重阴影、位移悬停和移动底栏模糊。
- 管理后台按路由懒加载，不进入公开首页首包。

## 管理后台

后台固定为七个模块：概览、域名、分类、站点设置、到期提醒、账户安全、操作日志。

- PBKDF2 密码、HMAC 会话、CSRF、防暴力登录、会话撤销与改密；
- 域名 CRUD、服务端筛选/排序、卡片关键词、可选简介、生命周期文字资料、精品、上架状态和批量操作；支持批量设置关键词，以及通过当前启用的 AI 配置生成可编辑的中文域名简介；
- 批量精品、上架、隐藏和删除走统一确认弹窗，显示选中数量与即将执行的动作；批量设置分类可选现有分类或新建；选中数超过后端 500 个 id 的上限时前端自动分批提交；切换筛选条件会清空选择，避免误伤当前看不见的域名；
- CSV 导入先 dry-run 预览：展示将新增、已存在、字段冲突、无效与文件内重复的条数，并按字段列出会被改写的新旧值；dry-run 不写数据库，确认后才执行真实导入；
- 操作日志顶部提供近 7 天操作趋势折线图，并按创建/更新/删除/批量分组计数；
- 站点设置内可保存多个 AI 配置，默认提供 DeepSeek V4 Flash 模板，可切换启用项且不会回传已保存的 API Key；
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

本地 Vite 默认关闭 Cloudflare 远程 binding 代理，避免开发与 CI 依赖线上凭据；AI 简介接口在自动化测试中使用 mock，生产环境由 Worker 使用管理员加密保存的提供商配置发起请求。

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
tests/                 单元、集成与 Playwright E2E（含 22 张视觉基线截图）
docs/                  部署、导入与安全文档
```

详细说明见 [Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md)、[安全设计](docs/SECURITY.md)、[设计规范](design.md) 与 [HANDOFF](HANDOFF.md)。
