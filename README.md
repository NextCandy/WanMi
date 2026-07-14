# 玩米（WanMi）

玩米是一个面向自有域名资产的中文展示与管理系统。前台公开展示已上架的域名，后台负责域名、分类、站点设置、到期提醒与安全会话。前后台与 API 同源，共享同一个 Cloudflare D1 数据库。

视觉是一套 **Black Gold Domain Asset Vault**（纯黑 OLED 背景 + 暖黑卡片 + 香槟金强调）设计系统，完整规范见 [`design.md`](design.md)——**改任何界面前先读它**。

## 线上环境

- 生产地址：<https://wanmi.org>
- 管理后台：<https://wanmi.org/admin>
- Cloudflare Worker：`wanmi`
- D1：`wanmi-db`（绑定 `DB`）
- R2：`wanmi-assets`（绑定 `UPLOADS`）
- Cron：每天 `01:00 UTC`（`Asia/Shanghai 09:00`），用于到期提醒与日志清理

唯一业务源文件为 `data/source/WanMi.csv`。导入保留历史记录，并把源文件中不存在的旧域名归档；连续导入两次后公开展示数不变，同步是幂等的。

## 页面

| 路由 | 内容 |
| --- | --- |
| `/` | 资产总览 Dashboard：总数亮卡、核心指标、资产结构（分类/后缀/精品占比）、最近添加与更新 |
| `/domains` | 域名列表：搜索、状态 Segmented、多标签分类 Chip、后缀与排序、分页 |
| `/admin` | 后台：概览、域名管理、分类、站点设置、到期提醒、账户安全、操作日志 |

**点击任意域名会直接在新标签页打开该域名本身**（不再有站内详情页）。旧的 `/d/<domain>` 链接会自动回落到域名列表并预填搜索词。

## 功能

- 按表头解析 UTF-8/BOM、CRLF、引号转义的 CSV；用 `tldts` 统一处理协议、路径、多级公共后缀、IDN/Punycode 与可注册主体。
- 公开简介字段：后台可编辑或清空，前台卡片在无简介时自动收紧；CSV 重导不覆盖管理员写的简介。
- 精品状态可在后台切换、筛选与批量设置；前台默认精品优先。CSV 重导不覆盖管理员设置的精品状态。
- 前台服务端搜索、后缀/位数/分类/精品筛选、排序、分页，URL 状态可分享。
- 自动分类对齐 [dog.do](https://github.com/NextCandy/dog.do) 的数字、字母、拼音、英文、杂米判断顺序与贪心拼音拆分，产出 `纯数字 / 三数字 / 纯字母 / 单拼 / 双拼 / 杂米 …` 共 20 个细分标签。**一个域名可同时命中多个标签**；人工分类优先且可恢复为自动。
- 前后台共享 D1；写操作由数据库触发器递增数据版本，已打开的前台每 8 秒检测版本并重新拉取。
- 后台：真实登录与会话管理（含登录地）、改密、域名 CRUD、批量操作、分类管理、CSV 导入/导出、操作日志（筛选/导出/90 天自动清理）。
- R2 图片上传（Logo / Favicon / 微信二维码）、Cron 到期提醒、Email/Telegram/Bark/Server 酱/企微/飞书/Discord 通知渠道（密钥一律 AES-GCM 加密存储）。
- 公共 API 走字段白名单，不暴露管理员、内部备注、凭据或原始 CSV 字段。

### 已移除的功能

以下功能已在 migration `0008` 中连同数据表一起移除，**不要再重新引入**：注册商 API 账户与同步、DNS 解析读写、域名求购意向表单、后台求购线索管理、站内域名详情页。

## 数据诚实性（硬性约束）

界面不得展示库里不存在的数据。当前 D1 的真实情况：

- **没有估值字段** → 首页不展示任何金额。
- **`created_at` 集中在导入当天** → 不做时间趋势折线，资产结构改用真实的分类/后缀/长度分布。
- **`expires_at` 目前为空**（注册商同步已移除，需手工录入）→ 到期模块显示"暂无到期数据"，不编造。

新增任何指标前，先确认字段真实存在且有数据。

## 技术栈

React 19、TypeScript、Vite 8、Cloudflare Vite Plugin、Workers Static Assets、Hono、D1、R2、Cron Triggers、Zod、Vitest、Playwright。UI 是手写 CSS + CSS Variables，**没有 Tailwind，也没有运行时 UI 依赖**。

## 本地开发

要求 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm domains:import:local
pnpm dev
```

`.dev.vars` 需填 `ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`SESSION_SECRET`、`CREDENTIALS_ENCRYPTION_KEY`（已被 Git 忽略）。首次登录时 Worker 才创建管理员；管理员已存在时，重新部署不会重置密码。

## 常用命令

```bash
pnpm dev
pnpm check          # typecheck + lint + test + build + 数据校验 + 无假数据扫描
pnpm test:e2e
pnpm deploy

pnpm db:migrate:local
pnpm db:migrate:remote
pnpm db:backup

pnpm domains:validate
pnpm domains:import:local
pnpm domains:import:remote
pnpm domains:verify
pnpm verify:no-demo-data
```

**提交前请跑 `pnpm check`。**

## 生产部署

```bash
pnpm db:backup          # 结构变更前务必先备份
pnpm db:migrate:remote
pnpm check
pnpm build && wrangler deploy
```

备份写入已被 Git 忽略的 `backups/`。恢复用 `wrangler d1 execute wanmi-db --remote --file=<backup.sql>`。

API Token 只经 `CLOUDFLARE_API_TOKEN` / `GH_TOKEN` 等环境变量注入；Worker 运行期 Secret 用 `wrangler secret put` 设置。真实值不得进入 README、示例文件、Wrangler 配置、构建产物或日志。Token 一旦出现在聊天、终端历史或提交中，必须立即撤销并轮换。

## 目录

```text
src/client/       React 前台与后台（components / pages / styles）
src/worker/       Hono Worker、认证、通知与到期提醒
src/shared/       CSV、域名归一化、Schema 与共享类型
scripts/          数据导入、验证与安全扫描
migrations/       D1 migration
data/source/      唯一原始 CSV
tests/            单元、集成与 E2E
```

更详细说明见 [设计系统](design.md)、[交接文档](HANDOFF.md)、[Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md) 与 [安全设计](docs/SECURITY.md)。
