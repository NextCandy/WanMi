# feat: UI polish + notify fix + stats + contacts + registrar cleanup

## 完成内容

- 按最新反馈重做前台：移除 Hero 和精品横向区，首页直接显示分类胶囊、搜索筛选工具条、紧凑域名卡片、站内详情页与完整页脚。
- 域名卡片在桌面端调整为 4 列紧凑布局；按最新反馈彻底移除访客 IP 信息卡及后台开关，并以圆角、柔和层次和轻阴影替代生硬直线。
- 域名名称进入站内详情页，展示附件导入的注册日期和到期日期，不发起外部 RDAP/WHOIS 查询。
- 分类同时支持自动分类与人工分类，并在前台筛选、卡片和详情页中实际可用。
- 后台重做侧栏、概览、域名管理、到期提醒、站点设置、账户安全和操作日志；移除 DNS 解析导航入口。
- 域名管理增加“导出全部 / 导出筛选”和单条完整编辑，域名、后缀、注册日期、到期日期、注册商、简介均可导出与修改。
- 重构 Bark、Discord、Resend Email、飞书、Server 酱、Telegram、企业微信七类通知配置，增加加密存储、真实测试结果和 `last_test` 健康状态。
- 新增 PV、UV、域名点击、求购转化率和访客地区统计，后台提供图表与 Top 列表。
- 增加 Footer 联系方式图标和微信二维码弹层；访客 IP 卡已移除，管理入口保留在页脚。
- 修正 Cloudflare Web Analytics 的 CSP 白名单，避免生产控制台拦截统计脚本。
- 更新 README、部署说明、截图和设计参考。

## 数据库迁移

- `0008_notification_channel_settings.sql`
- `0009_stats_events.sql`
- `0010_contact_settings.sql`
- `0011_notification_last_test.sql`
- `0012_domain_imported_dates.sql`
- `0013_domain_import_details.sql`

`0012`、`0013` 按仓库内 `data/source/WanMi.csv` 的 859 行资料回填日期与注册商，并扩展后续 CSV 导入所需字段；其中 852 条有日期/注册商值，7 条源数据为空。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm wrangler deploy --dry-run
```

- 最新改动的 39 项单元测试通过；远程迁移前另以 Wrangler 本地 D1 完整执行 `0012`、`0013`。
- 远程 D1 迁移已应用，Worker 已部署到 `wanmi.org`。
- 生产接口确认 `094.org` 返回导入的注册日期 `2003-05-23` 和到期日期 `2028-05-23`。
- Playwright 验收前台首页、域名详情和后台概览；后台导航已无 DNS 解析入口。
- 生产“导出全部”返回 862 条域名加 1 行表头；字段顺序为域名、后缀、注册日期、到期日期、注册商、简介。
- 生产后台实际打开并保存 `094.org` 编辑弹窗，控制台无错误。
- Bark 使用现有生产配置完成真实发送测试并记录成功；其他通知渠道因生产环境未配置对应凭证，保持未启用状态。

## 视觉资料

- `docs/design-reference/goal-2026-07/before-public.png`
- `docs/design-reference/goal-2026-07/before-admin-overview.png`
- `docs/design-reference/goal-2026-07/public-home-concept.png`
- `docs/design-reference/goal-2026-07/public-detail-concept.png`
- `docs/design-reference/goal-2026-07/admin-overview-concept.png`
- `docs/design-reference/goal-2026-07/admin-domains-concept.png`
- `docs/design-reference/goal-2026-07/admin-notifications-concept.png`
- `docs/design-reference/goal-2026-07/admin-settings-concept.png`
- `docs/design-reference/goal-2026-07/after-public-desktop.png`
- `docs/design-reference/goal-2026-07/after-public-mobile.png`
- `docs/design-reference/goal-2026-07/after-admin-overview.png`
- `docs/design-reference/goal-2026-07/after-admin-notifications.png`

## 部署

```bash
pnpm wrangler d1 migrations apply wanmi-db --remote
pnpm wrangler deploy
```

所有 Secret 均保留在 Cloudflare，不写入仓库、PR 正文或日志。
