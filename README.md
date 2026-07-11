# 玩米（WanMi）

玩米是一个面向自有域名资产的中文展示与管理系统。品牌字标为毛笔楷书「玩」字（Ma Shan Zheng），域名与数字使用 Space Grotesk 展示字体，代码类内容（DNS 记录值、日志时间）使用 JetBrains Mono。前台用于公开展示经管理员上架的域名，后台用于管理域名、市场数据、注册商账户、DNS、站点设置、到期提醒和安全会话。前后台与 API 同源，并共享同一个 Cloudflare D1 数据库。

## 线上环境

- 生产地址：<https://wanmi.1n.workers.dev>
- 管理后台：<https://wanmi.1n.workers.dev/admin>
- Cloudflare Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- Cron：每天 `01:00 UTC`，即 `Asia/Shanghai 09:00`

生产 D1 已完成 migration 和两次幂等 CSV 导入验证：域名 662、市场记录 662、公开展示 662。生产冒烟已覆盖错误密码、真实登录、后台统计、隐藏/恢复域名、退出和旧会话失效。

## 功能

- 从唯一源文件 `data/source/domains-1783619533.csv` 全字段导入 662 个真实域名。
- 前台服务端搜索、后缀/位数/分类/精品筛选、排序（最新/报价/位数/热度）、分组视图（精品/二字符/三字符/数字）、分页、URL 可分享状态和动态联系方式。
- 域名详情页 `/d/:domain`：RDAP Whois 摘要（IANA bootstrap 直连权威服务）、Make Offer 求购表单（写入 leads 并触发通知渠道）、相关域名推荐、独立 SEO meta + JSON-LD + 动态 og 封面、sitemap.xml。
- 深浅色主题（跟随系统 + 手动切换，首帧无闪烁），oklch 语义设计令牌，等宽字体域名排版。
- 后台真实登录、会话管理（含登录地）、改密、域名 CRUD、服务端排序、列显隐、批量管理（含批量报价与导出选中）、分类管理、求购线索、CSV 导入/导出和操作日志（筛选/导出/90 天自动清理）。
- 概览仪表盘：总市值、平均报价、Views 热门榜、线索漏斗、90 天到期列表。
- 注册商凭据 AES-GCM 加密，支持 Cloudflare、GoDaddy、NameSilo、Porkbun、DNSPod 和阿里云适配器。
- DNS 远端成功后才更新 D1 缓存；支持 A、AAAA、CNAME、MX、TXT、NS、CAA、SRV，并明确报告服务商能力限制。
- R2 图片上传、Cloudflare Cron 到期提醒、Email/Telegram/Bark 真实测试。
- 公共 API 字段白名单，不公开管理员、内部备注、凭据、原始 CSV 或市场内部字段。

## 界面设计

前后台共享一套手写 CSS 设计系统（`src/client/styles/app.css`），无运行时 UI 依赖：

- oklch 语义令牌统一管理颜色、圆角、阴影与动效节奏；主题色 `--brand` 由后台站点设置动态注入，所有派生色通过 `color-mix` 计算；深浅色双主题跟随系统并可手动切换。
- 前台毛玻璃吸顶导航内嵌站点统计（域名总数/后缀数/更新时间），页面直达分组、搜索、筛选与域名网格；卡片字号按域名长度五档自适应并按序入场。
- 后台为深色侧边栏 + 暖白工作区，统计卡片带主题色高光条，表格行悬停、开关辉光等微交互统一缓动曲线。
- 全站遵循 `prefers-reduced-motion`，保留键盘 `focus-visible` 焦点环。

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
pnpm domains:verify
pnpm verify:no-demo-data
```

远程导入和部署所需 Token 只通过环境变量或 Wrangler Secret 提供，不得写入仓库。完整上线与轮换流程见部署文档。

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
