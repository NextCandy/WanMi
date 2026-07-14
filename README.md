# 玩米（WanMi）

玩米是一个面向自有域名资产的中文展示与管理系统。品牌字标为毛笔楷书「玩」字（Ma Shan Zheng），域名与数字使用 Space Grotesk 展示字体，日志时间等技术值使用 JetBrains Mono。前台用于公开展示经管理员上架的域名，后台用于管理域名、分类、注册商账户、站点设置、到期提醒和安全会话。前后台与 API 同源，并共享同一个 Cloudflare D1 数据库。

## 线上环境

- 生产地址：<https://wanmi.org>
- 管理后台：<https://wanmi.org/admin>
- Cloudflare Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- Cron：每天 `01:00 UTC`，即 `Asia/Shanghai 09:00`

当前唯一业务源文件为 `data/source/WanMi.csv`：原始 859 条、有效唯一 859 条、重复 0、无效 0。导入会保留历史记录并将源文件中不存在的旧域名归档；本地连续导入两次后总记录 874、公开展示 859，证明同步幂等。

## 功能

- 按表头名称解析 UTF-8/BOM、CRLF、引号转义 CSV；使用 `tldts` 统一处理协议、路径、多级公共后缀、IDN/Punycode 与可注册域名主体。
- 新增公开简介字段：后台可编辑或清空，前台卡片保留稳定的两行区域、详情页展示完整纯文本；CSV 重导不覆盖管理员简介。
- 精品状态可在后台直接切换、筛选及批量设置/取消，前台使用克制标识并默认精品优先；CSV 重导不覆盖管理员精品状态。
- 前台不再使用 Hero，打开首页即显示分类胶囊、搜索筛选工具条和紧凑域名列表；服务端搜索、后缀/位数/分类/精品筛选、排序、分页和 URL 状态均保留。
- 域名详情页 `/d/:domain`：直接展示 CSV 导入的注册日期与到期日期（不发起外部 Whois/RDAP 查询）、Turnstile 求购意向表单（每 IP 每分钟最多 3 次）、相关域名推荐与安全外链。
- 深浅色主题（跟随系统 + 手动切换，首帧无闪烁），oklch 语义设计令牌，等宽字体域名排版。
- 后台真实登录、会话管理（含登录地）、改密、域名 CRUD、后缀/分类/展示/精品筛选、服务端排序、列显隐、批量管理、分类管理、求购线索、CSV 导入/导出，以及操作日志（筛选/导出/90 天自动清理）；支持一键导出全部 862 条记录，CSV 包含域名、后缀、注册日期、到期日期、注册商和简介，每条记录也可在后台编辑这些字段。
- 自动分类覆盖数字、字母、拼音、英文与杂米，并采用稳定的贪心拼音拆分；自动标签与人工分类在后台合并展示，人工优先且可恢复自动，并保留 `num3…num9`、`pinyin1…pinyin4`、`alpha3/alpha4`、`mixed2/mixed3` 等子类和置信度。公共 API、前台分类栏、域名列表和详情页均使用同一套 D1 多标签分类。
- 公共列表与后台共享 D1；写操作由数据库触发器递增数据版本，已打开的前台每 8 秒检测版本并重新验证，刷新后立即读取最新数据。
- 概览仪表盘：域名与展示统计、匿名 PV/UV 七日趋势、域名点击 Top 10、求购转化率、访客地区、通知渠道健康和 90 天到期列表。
- 注册商凭据 AES-GCM 加密，支持 Cloudflare、GoDaddy、NameSilo、Porkbun、Spaceship、Namecheap、Dynadot、DNSPod 和阿里云适配器。
- R2 图片上传、Cloudflare Cron 到期提醒；Email（Resend）、Telegram、Bark、Server 酱、企业微信、飞书和 Discord 均支持独立加密配置、真实测试与 `last_test` 状态。
- 页脚联系方式按配置显示 Email、Telegram、WhatsApp、X、小红书、微信和 QQ 图标，并保留低调管理入口；访客 IP 信息卡已移除。
- 公共 API 字段白名单，不公开管理员、内部备注、凭据、原始 CSV 或市场内部字段。

## 界面设计

前后台共享一套手写 CSS 设计系统（`src/client/styles/app.css`），无运行时 UI 依赖：

- oklch 语义令牌统一管理颜色、圆角、阴影与动效节奏；主题色 `--brand` 由后台站点设置动态注入，所有派生色通过 `color-mix` 计算；深浅色双主题跟随系统并可手动切换。
- 前台采用分类优先的编辑式目录：安静的吸顶导航、常驻分类轨、统一 48px 筛选控件和固定密度域名列表；分类标签与复制/联系操作拥有独立布局区域，桌面与移动端均不会重叠。
- 后台为深色侧边栏 + 暖白工作区，标题、正文、表格和空状态采用一致的字号层级；短面板按内容自然收口，统计卡片根据数量自适应铺满，移动端导航提供完整触控目标和横向浏览。
- 全站采用 160/220/280ms 的强 ease-out 动效体系，频繁交互保持克制，悬浮位移仅对精细指针启用；支持 `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast` 与键盘 `focus-visible`。

## 技术栈

React 19、TypeScript、Vite 8、Cloudflare Vite Plugin、Cloudflare Workers Static Assets、Hono、Cloudflare D1、R2、Cron Triggers、Zod、Vitest、Playwright。

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

`.dev.vars` 必须填写 `ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`SESSION_SECRET` 和 `CREDENTIALS_ENCRYPTION_KEY`，且已经被 Git 忽略。首次登录时 Worker 才会创建管理员；管理员已存在时，重新部署不会重置密码。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm check
pnpm deploy

pnpm db:migrate:local
pnpm db:migrate:remote
pnpm db:backup

pnpm domains:parse
pnpm domains:validate
pnpm domains:report
pnpm domains:import:local
pnpm domains:import:remote
pnpm domains:verify -- --remote
pnpm verify:no-demo-data
```

## 生产迁移与部署

```bash
pnpm db:backup
pnpm domains:validate
pnpm domains:import:remote -- --dry-run
pnpm db:migrate:remote
pnpm domains:import:remote -- --dry-run
pnpm domains:import:remote
pnpm domains:import:remote       # 幂等复验
pnpm domains:verify -- --remote
pnpm check
pnpm wrangler deploy
```

备份写入已被 Git 忽略的 `backups/`。恢复前先停止写入并使用 `wrangler d1 execute wanmi-db --remote --file=<backup.sql>`；恢复后重新运行远程验证。生产验收需覆盖 `wanmi.org` 首页、详情页、`/admin` 直接刷新、桌面/手机布局、错误密码、登录、简介/精品/分类修改、最多 10 秒同步、清理测试值和退出登录。

远程 API Token 只通过 `CLOUDFLARE_API_TOKEN`、`GH_TOKEN`/`GITHUB_TOKEN` 等环境变量或 Secret 注入；Worker 运行 Secret 使用 `wrangler secret put` 的标准输入或交互方式设置。真实值不得进入 README、`.env.example`、Wrangler 配置、构建产物或日志。Token 一旦出现在聊天、终端历史或提交中必须立即撤销并轮换；管理员已存在时不得通过重新部署重置密码。

## 当前数据统计

- CSV Premium 标记：87（只用于新增记录的初始值，管理员后续设置受保护）
- 简介非空：0
- 当前自动分类统计：英文 269、拼音 313、字母 118、数字 107、杂米 43、其他 9
- 主要后缀：`.com` 194、`.org` 154、`.cn` 84、`.net` 83、`.xyz` 60、`.cc` 44、`.pm` 33、`.de` 28

## 目录

```text
src/client/            React 前台和后台
src/worker/            Hono Worker、认证、服务商适配器
src/shared/            CSV、域名、Schema 和共享类型
scripts/               数据导入、验证和安全扫描
migrations/            D1 migration
data/source/           唯一原始 CSV
data/generated/        脚本生成的标准化数据与报告
tests/                 单元、集成与 E2E
docs/design-reference/ 原 Claude Design 原型，仅供视觉参考
```

更详细说明见 [Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md)、[注册商适配器](docs/REGISTRAR_PROVIDERS.md) 与 [安全设计](docs/SECURITY.md)。
