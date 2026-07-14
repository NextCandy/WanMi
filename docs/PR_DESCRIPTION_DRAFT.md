# feat: UI polish + notify fix + stats + contacts + registrar cleanup

## 现状审计

- 前台仍是左侧长分类轨 + 表格行列表，首屏没有双栏 Hero、精品横向区、卡片/紧凑视图切换，也没有完整 Footer 联系方式与访客 IP 卡。
- 前台主导航仍暴露“管理后台”；域名文本进入站内详情而不是直接访问域名。
- 后台侧栏仍有独立“注册商”，站点设置尚未承接注册商集成。
- 通知设置仍以单表散列字段表达，Bark 未拆分服务地址与设备密钥，各渠道没有可持久化的 `last_test`，Email 也没有 Resend 通道。
- 概览没有 PV/UV、域名点击、转化率和访客地区统计；D1 尚无 `stats_events`。
- 联系方式字段不完整，Footer 不支持微信弹层、二维码、QQ、WhatsApp、X、小红书和 ippure 卡片。
- 分类 API 尚未提供 `{ auto, manual }` 的统一公开结构，项目文档和分类提示仍包含不应外显的外部品牌名。

## 实施计划

1. 建立奶油纸张/深墨/暖橙设计令牌、语义化 Lucide 图标和统一相对时间工具。
2. 新增通知/统计/联系方式迁移；重构七类通知通道、真实测试与 `last_test`。
3. 重构后台壳层、概览、域名管理、到期提醒、站点设置、账户安全与操作日志。
4. 重构前台 Hero、分类抽屉、精品横向区、卡片/紧凑视图、详情与求购流程。
5. 将域名服务商管理移动到“站点设置 → 集成”，修复 DNS 账户提示，移除外部项目字样与顶部后台入口。
6. 增加匿名 PV/UV/域名点击追踪、D1 汇总与后台统计图表。
7. 增加 Footer 联系图标、微信弹层、R2 二维码与可开关访客 IP 卡。

## 视觉规范

- 背景：`oklch(0.985 0.008 80)`；文字：`oklch(0.18 0.02 260)`；品牌：`#E85D2A`。
- 后台侧栏：`oklch(0.16 0.02 260)`；激活规则：`#F97316`。
- 标题：Noto Serif SC；正文：Inter + PingFang SC；域名/技术值：JetBrains Mono。
- 圆角 12px；阴影：`0 1px 2px rgba(0,0,0,.04), 0 12px 32px -12px rgba(232,93,42,.12)`。
- 图标统一采用 Lucide 线性图标，18px、约 1.75px 线宽。

## 设计与基线截图

- `docs/design-reference/goal-2026-07/before-public.png`
- `docs/design-reference/goal-2026-07/before-admin-overview.png`
- `docs/design-reference/goal-2026-07/public-home-concept.png`
- `docs/design-reference/goal-2026-07/public-detail-concept.png`
- `docs/design-reference/goal-2026-07/admin-overview-concept.png`
- `docs/design-reference/goal-2026-07/admin-domains-concept.png`
- `docs/design-reference/goal-2026-07/admin-notifications-concept.png`
- `docs/design-reference/goal-2026-07/admin-settings-concept.png`

## 验证与部署

最终合并前执行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm wrangler deploy --dry-run
```

生产步骤：

```bash
pnpm wrangler d1 migrations apply wanmi-db --remote
pnpm wrangler deploy
pnpm wrangler secret list
```

生产验收覆盖通知真实测试、`stats_events` 写入、Footer 联系图标、微信二维码、访客 IP 卡、桌面/移动端和后台关键流程。任何 Secret 均不写入仓库、PR 正文或日志。
