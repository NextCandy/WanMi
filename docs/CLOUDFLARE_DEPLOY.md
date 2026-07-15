# Cloudflare 部署

WanMi 使用单一 Cloudflare Worker：Vite 构建 React Static Assets，Hono 处理 `/api/*`、首页 SEO、`/sitemap.xml`、`robots.txt` 和旧 `/d/*` 重定向；D1 保存业务数据，R2 保存站点图片，Cron 每天 `01:00 UTC` 检查到期提醒。

## 1. 认证与资源

```bash
pnpm exec wrangler whoami
```

本地交互使用 `wrangler login`；CI 或非交互环境使用最小权限的 `CLOUDFLARE_API_TOKEN`。Token 不得写入命令脚本、配置或仓库。

生产资源：

- Worker：`wanmi`
- D1：`wanmi-db`，绑定 `DB`
- R2：`wanmi-assets`，绑定 `UPLOADS`
- Static Assets：绑定 `ASSETS`
- Cron：`0 1 * * *`
- 域名：<https://wanmi.org>

## 2. Secret

首次部署使用交互输入：

```bash
pnpm exec wrangler secret put ADMIN_EMAIL
pnpm exec wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put CREDENTIALS_ENCRYPTION_KEY
```

通知渠道按需配置 `TELEGRAM_BOT_TOKEN`、`RESEND_API_KEY` 和 `EMAIL_FROM`。管理员已存在且确认可登录后，可删除一次性 `BOOTSTRAP_ADMIN_PASSWORD`；代码不会重置已有密码。

## 3. 发布顺序

```bash
pnpm check
pnpm test:e2e
pnpm exec wrangler d1 migrations list wanmi-db --remote
pnpm db:backup
pnpm db:migrate:remote
pnpm run deploy
pnpm verify:production
```

必须先备份再迁移。`pnpm db:backup` 将完整 D1 导出到被 Git 忽略的 `backups/`；输出中的临时下载 URL 也不得粘贴到公开渠道。

## 4. 当前迁移

### `0015_restore_domain_management_schema.sql`

该文件只做历史列名兼容：为全新安装建立临时 `registrar` 桥、添加 `registrar_label`，并回填 859 个权威 CSV 域名的注册商文字。它不创建注册商账户、DNS 或求购线索表。

生产库已经执行过同名旧版本，所以不会重新运行；生产原本已有 `registrar`、`registrar_label` 和历史业务表。

### `0016_remove_registrar_dns_leads.sql`

这是当前唯一待执行迁移：

- 规范化 `domains.registrar_name`；
- 重建临时导入表为统一列名；
- 删除注册商账户、DNS 缓存、求购线索及关联字段；
- 保留所有域名、公开/精品状态、人工字段、分类关联和通知发送历史；
- 重建域名索引和版本触发器。

迁移前必须记录以下基线：域名总量、公开量、精品量、分类关联量、通知历史量，以及待删除表数量。迁移后再次执行同样查询，并确认 `PRAGMA foreign_key_check` 无结果。

## 5. 生产验收

```bash
curl -fsS https://wanmi.org/api/health
curl -fsS 'https://wanmi.org/api/public/domains?q=wanmi.org'
curl -fsS 'https://wanmi.org/api/public/domains?pageSize=36'
pnpm verify:production
```

还必须确认：

- 首页只请求当前 36 条域名，不做下一页预取；
- 搜索按钮贴在右侧，卡片仅三枚图标且没有“我想要”；
- 桌面与手机无横向溢出，控制台无错误；
- 后台只有七个模块；
- `/api/admin/registrars`、`/api/admin/leads`、域名 DNS、`/api/public/offers`、RDAP 和旧详情 API 均为 404；
- D1 不存在 `registrar_accounts`、`dns_records_cache`、`domain_leads`。

需要写链路冒烟时才运行：

```bash
pnpm verify:production -- --write
```

脚本会创建唯一临时域名并在 `finally` 中删除。任何写验证前都要确认备份和管理员凭据来源安全。

## 6. 回滚

优先使用 Cloudflare D1 Time Travel；也可使用发布前的完整 SQL 导出。数据库恢复后，再回滚 Worker 版本并重新核对数据基线。不要用已删除的旧“恢复注册商/DNS/线索”脚本，它已从仓库移除。

## 当前生产状态

- 发布日期：2026-07-15
- Worker 版本：`c631ab3f-be50-474a-8455-75f221b32f95`
- 已核验数据：862 个域名、862 个公开、87 个精品、1992 条分类关联
- 被删除业务表：`registrar_accounts`、`dns_records_cache`、`domain_leads`
- 回滚备份：`backups/wanmi-20260715T043546Z.sql`（仅本机、Git 忽略）
