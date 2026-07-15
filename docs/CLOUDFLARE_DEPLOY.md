# Cloudflare 部署

WanMi 使用单一 Cloudflare Worker：Vite 构建 React Static Assets，`/api/*`、`/d/*` 和 `/` 由 Hono Worker 优先处理，D1 保存业务数据，R2 保存站点图片，Cron 每天 01:00 UTC（Asia/Shanghai 09:00）检查到期提醒。首页经过 Worker 是为了注入实时站点元数据和域名 `ItemList` JSON-LD，页面脚本和其他资源仍由 Static Assets 提供。

配置依据 2026 年 Cloudflare Workers、Vite Plugin、D1、R2、Static Assets、Secrets 与 Cron 官方文档。Vite Plugin 会自动填写客户端构建目录，因此输入 `wrangler.jsonc` 只配置 `binding`、SPA fallback 和 `run_worker_first`，不硬编码输出目录。

## 1. 权限检查

```bash
pnpm wrangler whoami
```

若未登录，交互式环境运行：

```bash
pnpm wrangler login
```

CI 使用最小权限的 `CLOUDFLARE_API_TOKEN` 与正确的 `CLOUDFLARE_ACCOUNT_ID`。

## 2. 创建资源

```bash
pnpm wrangler d1 create wanmi-db
pnpm wrangler r2 bucket create wanmi-assets
```

将 D1 命令返回的真实 `database_id` 写入 `wrangler.jsonc` 对应 `DB` 绑定。R2 绑定名称为 `UPLOADS`，Bucket 名为 `wanmi-assets`。不得把 API Token 写入配置。

## 3. 设置 Secret

以下命令必须交互输入，不要把值放在命令行参数里：

```bash
pnpm wrangler secret put ADMIN_EMAIL
pnpm wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
pnpm wrangler secret put SESSION_SECRET
pnpm wrangler secret put CREDENTIALS_ENCRYPTION_KEY
```

按需增加：

```bash
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
pnpm wrangler secret put RESEND_API_KEY
pnpm wrangler secret put EMAIL_FROM
```

## 4. Migration、构建和部署

```bash
pnpm db:backup
pnpm db:migrate:remote
pnpm check
pnpm run deploy
```

`pnpm db:backup` 使用跨平台 Node 脚本把远程 D1 导出到被 Git 忽略的 `backups/`。`pnpm build` 会删除 Vite 预览输出中可能复制的 `.dev.vars`，并扫描构建文件，发现任何本地 Secret 即失败。

当前最新迁移为 `0015_restore_domain_management_schema.sql`：

- `0014_black_gold_accent.sql` 只会把历史默认橙色主题更新为金色；管理员已设置其他主题色时不会修改。
- `0015_restore_domain_management_schema.sql` 兼容曾执行过旧版 `0008_drop_registrar_dns_leads.sql` / `0009_domain_lifecycle_metadata.sql` 的生产库，幂等恢复注册商账户、DNS 缓存、求购线索表，新增无列名冲突的兼容字段，并从权威 CSV 回填 859 条注册商标签。

两项迁移都不会删除、归档或重新导入域名。`0015` 只恢复表结构；若旧表中的真实记录已经被历史迁移删除，必须从迁移前备份定向恢复：

```bash
pnpm db:restore:removed-records -- --backup=backups/<迁移前备份>.sql --dry-run
pnpm db:restore:removed-records -- --backup=backups/<迁移前备份>.sql
```

正式恢复需要 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 与 `D1_DATABASE_ID`。脚本使用 `INSERT OR IGNORE` 和精确域名关联更新，不输出加密凭据或联系人内容。恢复后必须分别核对域名、注册商账户、求购线索和 DNS 缓存数量。

## 5. 远程导入

远程导入脚本通过 D1 HTTP batch API 原子写入，需要在当前终端提供 Cloudflare API 凭据和数据库 ID：

```bash
pnpm domains:validate
pnpm domains:report
pnpm domains:import:remote -- --dry-run
pnpm domains:import:remote
pnpm domains:verify -- --remote
```

远程环境变量：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`。这些值不得写入仓库。

## 6. 生产验收

```bash
curl -fsS https://<worker-host>/api/health
curl -fsS 'https://<worker-host>/api/public/domains?q=wanmi.org'
curl -fsS 'https://<worker-host>/api/public/domains?q=02cloud.com'
pnpm verify:production
```

需要验证写链路时，通过临时环境变量提供管理员账号并显式启用可回滚冒烟：

```bash
pnpm verify:production -- --write
```

脚本会创建唯一临时域名，验证前台同步、批量精品/隐藏/恢复、CSV 预览、所选导出及操作者日志，并在 `finally` 中删除临时记录和退出会话。D1 的 `changes` 会把域名更新和 `public_data_version` 触发器更新一并计数，因此单域名更新可能返回 2；验收以“至少一条变更 + 公开状态一致”为准。

随后运行生产浏览器冒烟测试，确认首页 SEO 已注入、`/admin` 直接刷新不会 404、桌面与移动端无横向溢出、CSV 预览可取消、批量操作可审计，并验证后台修改会影响前台且测试数据已经恢复或删除。

首次管理员创建且登录确认后，可以删除一次性引导密码：

```bash
pnpm wrangler secret delete BOOTSTRAP_ADMIN_PASSWORD
```

删除前必须确认管理员已写入 D1，且当前密码可登录。代码不会因 Secret 消失而重置已有管理员。

## 当前生产状态

生产资源：

- 主 URL：<https://wanmi.org>
- Worker：`wanmi`
- D1：`wanmi-db`，绑定 `DB`
- R2：`wanmi-assets`，绑定 `UPLOADS`
- Static Assets：绑定 `ASSETS`
- Cron：`0 1 * * *`
- 已验证版本（2026-07-15）：`5558ddff-1b91-4525-8c83-77039eab472e`
- 已验证 D1：862 条域名、862 条公开、87 条精品、2 条注册商账户、1 条求购线索

部署完成后必须在当前任务记录中写明 Worker 版本、迁移结果、远程数据数量、浏览器检查和回滚点。以后每次部署仍要先执行检查和备份，确认 migration 风险，并通过 Secret/CI 环境提供 Token。
