# WanMi HANDOFF

## 本轮（2026-07-16：UI 精修 + 搜索增强 + 收藏 2.0 + 后台看板 + PWA）

> 渐进式增强，**没有推倒重构、没有换技术栈、没有改 D1 Schema**。前台默认 Paper 浅色 + 深色切换保持不变，黑金已作废。

### 1. 当前在做什么 / 本轮完成了什么

五个模块全部落地并验证（`pnpm check` 全绿、Playwright 5 项通过、明暗×桌面/手机实测）：

- **卡片 UI 精修（P0）**：搜索命中高亮（`lib/highlight.tsx`，React 节点安全拆分，不用 `dangerouslySetInnerHTML`，复制/读屏不受影响）；空简介由「暂无简介」软化为「简介待补充」。
- **搜索增强（P0）**：新组件 `components/CatalogueSearch.tsx` 取代旧的行内搜索框——ARIA combobox + listbox，三段式建议（匹配域名 250ms 防抖拉取 / 精品·后缀快捷 / 最近搜索），↑↓/Enter/Esc 键盘导航，`/` 全局聚焦；工具栏新增「已启用 N 项筛选」徽章。
- **收藏 2.0（P1，Local First）**：`hooks/useDomainFavorites.ts` 升级为 v2（收藏夹 / 标签 / 私人备注），`components/FavoritesToolbar.tsx` + 速览对话框内编辑区；JSON/CSV 导出、JSON 导入预览（新增/已存在/新夹计数 + 合并/覆盖，不静默覆盖）。备注明确「仅保存在当前浏览器」。
- **后台数据看板（P1）**：复用已装的 Recharts，`OverviewView` 新增精品占比环图、字符长度分布柱图、分类分布、到期分桶（已过期/30/60/90/90+）。全部 `ResponsiveContainer`，Tooltip 走令牌兼容深色。
- **PWA（P2）**：完善 `manifest.webmanifest`（id/scope/display_override/any+maskable 图标/纸色 bg）、金色品牌图标（`icon.svg`/`icon-maskable.svg`/更新 `favicon.svg`）、Apple/移动端 meta；新增 `public/sw.js` 并在 `main.tsx` **仅生产环境**注册。

### 2. 修改了哪些重要架构

- 前台搜索框从 PublicPage 行内实现抽出为独立 `CatalogueSearch`（自带建议获取与键盘导航）。
- `useDomainFavorites` 从「扁平 PublicDomain[]（v1）」升级为「收藏夹 + 富条目（v2）」，对外仍保留 `items/ids/toggle/sync` 兼容旧调用点。
- 后台 `OverviewView` 与 `/api/admin/dashboard` 增加只读聚合（无写、无新表）。
- 未改动：分页（服务端 36 条 / URL 状态）、登录/会话、CRUD、CSV、Cron、R2、Workers、现有公开 API 契约。

### 3. localStorage 收藏新格式（v2）

Key 仍为 `wanmi-domain-favorites`，结构：

```jsonc
{
  "version": 2,
  "folders": [{ "id": "folder-xxx", "name": "AI 项目", "createdAt": 0 }],
  "items": [{
    "domain": { /* PublicDomain 快照 */ },
    "folderId": "default | folder-xxx",   // "default" = 默认收藏
    "tags": ["短域名"],
    "note": "私人备注",
    "createdAt": 0, "updatedAt": 0
  }]
}
```

搜索历史 key 仍为 `wanmi-search-history`（v1，未改）。主题 key `wanmi-theme`（未改）。

### 4. 是否有数据迁移

- **本地 localStorage 有迁移**：读取时 `coerceFavoritesSnapshot()` 自动把「v1 `{version:1,items:PublicDomain[]}`」或「更老的裸数组」升级为 v2，逐条 `try` 容错、去重、损坏项跳过、非法输入返回空且不立即覆盖。已有 6 项单元测试锁定（`tests/unit/favorites-migration.test.ts`）+ 浏览器实测零丢失。
- **本次没有修改 D1 Schema**，没有新增/删除任何 migration。

### 5. 新增 API

- **无新增路由**。仅在既有 `GET /api/admin/dashboard` 的 batch 里增加三条只读聚合查询（字符长度分布 / 分类分布 / 到期分桶），响应新增 `lengths` / `categories` / `expiryBuckets` 字段。

### 6. 新增 PWA 策略（`public/sw.js`，改缓存逻辑请提升 `VERSION`）

- 导航(HTML)：**网络优先**，离线回退缓存的应用外壳（`/`）。
- 静态资源(/assets 哈希文件、图标、字体)：**stale-while-revalidate**。
- 公开 API `/api/public/*`：**网络优先**，仅离线回退上次成功响应——**绝不做固定 30 分钟缓存**。
- 后台 `/api/admin/*`、认证 `/api/auth/*`、埋点 `/api/track`、`/uploads/*`：**network-only，永不缓存**。
- 收藏/备注/标签在 localStorage，离线天然可读。仅生产注册，dev 不注册（保护 HMR）。

### 7. 当前已知问题 / 限制

- PWA 图标为 SVG（`any`+`maskable`），现代 Chromium/Android 可安装；iOS Safari 的 apple-touch-icon 偏好 PNG，若要 iOS 主屏更精细，后续可补 192/512 PNG 光栅图。
- SW 运行时验证是在「生产构建 + 静态服务器」下完成的；`vite dev` 按设计不注册 SW。
- 后台看板的可视化验证通过 Playwright E2E（自动化登录）完成，非人工登录。
- 到期数据依赖 migration 0012/0013 回填的 `registered_at`/`expires_at`（约 860 条），CSV 重导逻辑不受影响。

### 8. 下一步建议

- 补域名简介（仍大量为空，卡片已留位）。
- 如需 iOS 安装图标更精细，补 PNG 光栅图标。
- 收藏 2.0 可再加「按标签多选」「收藏夹拖拽排序」，但保持 Local First，别上服务器。

### 9. 绝对不要重新引入的内容

- Canvas 粒子 / 动态星空 / WebGL 背景
- 大面积玻璃拟态（重 `backdrop-filter`）
- 卡片逐项 stagger 入场动画
- 重阴影 / 大位移 Hover（最多 `translateY(-1~2px)`）
- 全站 Framer Motion
- 无限滚动（保留服务端分页 36 条 + URL 状态）
- **公开/动态 API 固定缓存 30 分钟**（SW 已按网络优先实现）
- 手机左右滑手势（左滑收藏 / 右滑复制）
- 已在 migration 移除的：注册商账户/同步、DNS 读写、求购/线索、站内域名详情页

---

## 上一轮（2026-07-15：删除回归功能 + 性能）

用户反馈昨天已经移除的求购、线索和 DNS 又出现在生产，同时首页搜索按钮过宽、卡片操作文字拥挤且页面卡顿。根因不是需求反复，而是上次从落后的 `codex/ui-notify-stats-contacts` 分支发布，覆盖了 `main` 中的正确删除提交；该分支还曾发生一次 UTF-8 源码损坏。

处理方式：先在原分支上恢复 UTF-8，再合并最新 `main`，保留当前前台设计与后台七模块，实现本轮 UI/性能修改，并新增兼容历史生产 schema 的清理迁移。合并过程中未覆盖 `.codex/` 或其他用户未跟踪文件。

## 已完成

### 删除回归功能

- 删除注册商账户路由、凭据、外部服务商适配器和后台模块。
- 删除 DNS 路由、缓存、管理界面和写入能力。
- 删除求购表单、线索 API/后台模块、Turnstile 求购组件和相关统计。
- `/api/admin/registrars`、`/api/admin/leads`、域名 DNS、`/api/public/offers`、RDAP 和旧公开详情端点均为 404。
- 注册商名称仅保留为 `domains.registrar_name` 普通文字资料。

### 前台 UI

- 搜索栏为 20px 图标、弹性输入、可选清空按钮、72px 搜索按钮；搜索按钮右边缘与搜索框完全对齐。
- 域名卡片只保留收藏、复制、速览三枚图标，所有按钮可见文字为空，使用 `aria-label`/`title` 提供无障碍名称。
- 删除“我想要”和联系购买入口；域名名称直接访问外部域名，速览保留复制、收藏、访问和相似域名。
- 桌面和手机操作图标统一靠右；手机保持至少 44px 的触控高度。

### 性能

- 公开页默认从 60 条降为 36 条，不再预取下一页。
- 数据版本检查从 8 秒改为 60 秒，并且只在页面可见时执行。
- 卡片使用 `React.memo`、`content-visibility` 和布局隔离。
- 移除卡片逐项入场动画、重阴影、位移悬停、页头和移动底栏模糊。
- 请求缓存最多保留 20 项，失败自动失效。

### 数据库兼容

- `0015_restore_domain_management_schema.sql` 被收敛为纯兼容桥，不再创建任何被删除的业务表。
- 新增 `0016_remove_registrar_dns_leads.sql`：
  - 同时兼容全新安装的 `registrar_name` 历史和生产库的 `registrar` 历史；
  - 合并为最终 `registrar_name`；
  - 重建导入暂存表，清除旧 `registrar` / `registrar_label`；
  - 删除 `registrar_accounts`、`dns_records_cache`、`domain_leads`；
  - 在重建 `domains` 前备份并恢复 `domain_auto_categories` 和 `notification_deliveries`；
  - 重建索引与公开数据版本触发器。
- 新增历史生产兼容集成测试，覆盖旧列名、分类、通知历史、删表和暂存表规范化。

## 生产变更前状态

- D1：862 个域名、862 个公开、87 个精品、1992 条分类关联。
- 待删除历史数据：2 个注册商账户、1 条求购线索、0 条 DNS 缓存。
- 通知发送历史：0 条。
- 859 个权威 CSV 域名有 `registrar_label`；`namesale.cn` 的“易名”仅在旧 `registrar` 列，迁移测试已覆盖并保留这种回退。
- 迁移前完整备份：`backups/wanmi-20260715T043546Z.sql`（Git 忽略，禁止提交或分享）。

## 验证结果

- `pnpm check`：通过。
- Vitest：10 个测试文件、58 项通过。
- Playwright：5 项通过，包含真实本地管理员登录、搜索按钮几何、36 张卡片、三枚无文字图标、无“我想要”、后台无被删模块、数据刷新与九种视口无横向溢出。
- 真实内置浏览器：
  - 1440×900：搜索按钮 72px、右侧间距 0、36 张卡片、三枚空文本图标；
  - 390×844：无横向溢出、搜索按钮仍贴右、移动底栏无模糊；
  - 收藏、复制、速览均可用，弹窗无求购入口；
  - 控制台无应用警告或错误。

## 生产发布

- Worker 版本 ID 会在每次 `main` 自动部署时重新生成，不在仓库固定记录；以最新 `WanMi Cloudflare` Actions 的 `deploy` 日志为准。
- 远程迁移：`0016_remove_registrar_dns_leads.sql` 已成功执行；远程迁移列表为空。
- 数据核验：域名/公开/精品为 862/862/87，分类关联为 1992，通知发送历史为 0，外键检查为空。
- 兼容核验：三个被删表均不存在，`namesale.cn.registrar_name` 保留为“易名”。
- 接口核验：健康检查正常，旧详情链接回到首页搜索，sitemap 只保留首页，旧公开详情、RDAP 与求购端点均为 404。
- 浏览器核验：生产桌面与手机首页均符合本轮 UI/性能边界；生产管理员登录成功，后台只显示七个保留模块，控制台无应用错误。

## 回滚

如果迁移或发布异常：

1. 立即停止后续写操作；
2. 使用 Cloudflare D1 Time Travel 或 `backups/wanmi-20260715T043546Z.sql` 恢复；
3. 回滚 Worker 到发布前版本；
4. 重新核对 862/862/87 和 1992 条分类关联后再开放后台写操作。

## 不能重复的坑

- 不要从落后功能分支直接发布；先比较 `origin/main`、当前分支和共同祖先。
- 不要用 GitHub 内容 API重写中文源码；发布前必须执行 UTF-8、类型、测试和构建检查。
- D1 远程曾执行过仓库当前不存在的历史迁移，不能只按本地文件推断列名。
- `DROP TABLE domains` 会触发外键级联；重建前必须保护所有仍需保留的子表数据。
- 页面性能策略不再承诺 8–10 秒自动刷新；后台修改后手动刷新立即生效，自动检查为可见状态下每 60 秒一次。
- Token 和后台密码曾出现在聊天中；本轮完成后应在 Cloudflare、GitHub 和后台轮换。
