# WanMi HANDOFF

> 写给一个**完全没有上下文**的新 Claude Code 会话。开工前先读这份 + `design.md`。

## 1. 项目是什么

WanMi / 玩米（<https://wanmi.org>）—— 部署在 Cloudflare Workers 上的**域名资产管理与展示平台**。
单 Worker 架构：React 19 + Vite 8 + TypeScript + Hono + D1 + R2 + Cron。**没有 Tailwind，用原生 CSS + CSS Variables。**

生产库有 **862 个真实域名**（本地 874，含 15 条归档），87 个精品，71 个后缀。数据是真的，**不要用 mock 替换**。

## 2. 当前任务（2026-07-15 完成）

按 3 张参考图把全站 UI 重构为 **Black Gold Domain Asset Vault**（纯黑 OLED + 香槟金 + 大圆角 + iOS 暗色质感）。
上一版是 Hallmark "Paper + Coral"（纸白 + 珊瑚橙），**已全量废弃**。更早的 "Emerald Vault 翡翠绿" 同样废弃。

设计系统的唯一事实来源是 **`design.md`**，改任何页面前先读它。

## 3. 已完成

- **Design System**：`tokens.css` 全量重写为黑金令牌；`src/client/styles/app.css` 全量重写（约 2000 行，覆盖前台/详情/后台/登录）。
- **首页 `/`**：新增资产总览 Dashboard（Hero 亮卡 + 三栏指标 + 资产结构 + 最近添加/更新）。
- **域名列表 `/domains`**：统计卡 + 搜索 + Segmented + 分类 Chip + 域名卡片网格 + 分页。
- **详情 `/d/:name`**：Serif 大标题 + 徽章 + Whois(RDAP) + 相关域名 + 求购表单。
- **后台 `/admin`**：10 个视图全部黑金化，并从 653 行单文件拆分为 `pages/admin/views/*.tsx`。
- **分类管理**：从 tag-pill 改为图标宫格（参考图 2）。
- **组件库**：新增 `components/ui.tsx`、`AppShell.tsx`、`DomainCard.tsx`、`PromptModal.tsx`、`icons.tsx`。
- **新 API**：`GET /api/public/overview`（只读聚合统计，供首页 Dashboard）。
- **合并了远程的多标签体系**（见下条）。

### 与远程多标签分类的合并

重构期间远程 main 已经先行推进了两个提交（多标签分类 + 3 家新注册商）。本次已 rebase 并完整适配：

- `PublicDomain.categories: string[]` —— 一个域名可同时属于多个自动标签（纯字母 / 双拼 / 三数字 …，共 20 个细分标签，见 `AUTO_CATEGORY_ORDER`）。
  前台卡片与详情页通过 `lib/site.ts` 的 `domainCategories()` 读取，卡片最多展示 2 个，避免 Badge 堆砌。
- 分类筛选（`/facets`、`/domains?category=`）走 `domain_auto_categories` 表匹配。
  **`/api/public/overview` 的分类统计必须与之同口径**，否则首页「分类分布」点进去会是空结果——这一点已修复并有断言。
- 注册商从 6 家扩到 **9 家**（新增 Spaceship / Namecheap / Dynadot）。
  `RegistrarsView` 的 `PROVIDERS` 顺序必须与 `worker/providers/factory.ts` 一致；Namecheap 需要额外填「API 白名单公网 IP」。
- 后台域名筛选下拉改用 `GET /api/admin/domains/filters`（带真实计数）；指派分类的下拉**只列人工分类**，自动标签是只读的。

## 4. 关键文件

```
tokens.css                          黑金 Design Tokens（唯一色值来源）
design.md                           设计系统规范（改 UI 前必读）
index.html                          字体加载 + 固定 dark 主题
src/client/App.tsx                  路由（含旧链接兼容）
src/client/styles/app.css           全站样式（~2000 行）
src/client/components/
  ui.tsx                            SearchBar/Segmented/Chips/Badge/Empty/Skeleton/Pagination/Modal
  AppShell.tsx                      桌面顶部导航 + 手机底部导航
  DomainCard.tsx                    DomainCard（网格）+ DomainRow（首页）
  PromptModal.tsx                   取代 window.prompt
  icons.tsx                         全部内联 SVG（24×24, stroke 1.75）
src/client/pages/public/            HomePage / DomainsPage / DomainDetailPage
src/client/pages/admin/
  AdminApp.tsx                      主壳 + 登录
  views/*.tsx                       10 个后台视图
src/worker/routes/public/index.ts   公开 API（含新增的 /overview）
```

## 5. 设计系统速查

- 背景 `#000000`，卡片 `#151515`，强调金 `#D8B638`，主文本 `#F5F5F7`。
- 字体：Instrument Serif（大数字/标题）+ Inter/Noto Sans SC（UI）+ JetBrains Mono（技术数据）。
- 圆角：Chip `9999px` / 搜索 `20px` / 域名卡 `22px` / 面板 `26px` / Modal `30px`。
- 阴影一律弱；金色 Glow 只轻微使用。
- **黑金是唯一主题**，没有明暗切换（ThemeToggle 已删除）。

## 6. 数据诚实性（**最重要**，别踩）

界面**不得**展示库里不存在的数据。当前 D1 的真实约束：

| 字段 | 状态 | 结论 |
| --- | --- | --- |
| 估值 | **没有这个字段** | 首页不展示任何金额 |
| `created_at` | 全部集中在导入当天 | **不做时间趋势折线**，画出来就是伪造 |
| `expires_at` | 全空 | 到期模块显示"暂无到期数据" |
| `description` | 862 条里只有 1 条有值 | 卡片无简介时自动收紧，不留空白 |

首页的"资产结构"用的是**真实**的分类 / 后缀 / 长度分布，这是刻意选择，不是偷懒。
新增任何指标前，先 `wrangler d1 execute` 确认字段真有数据。

## 7. 本次的破坏性变更（已验证不影响功能）

1. **路由变了**：`/` 从"域名列表"变成"资产总览"，列表移到 `/domains`。
   旧分享链接 `/?q=xxx&tld=yyy` 会**自动重定向**到 `/domains?...`（`App.tsx` 的 `LEGACY_LIST_PARAMS`），已有 E2E 覆盖。
2. **移除明暗主题切换**：黑金单主题。`ThemeToggle.tsx` 已删除，`index.html` 固定 `data-theme="dark"`。
3. **`accent_color` 不再注入前台主色**：该字段保留，现在只用于生成域名分享图（OG）。后台设置项文案已相应改为"分享卡片强调色"。
4. **后台"列显示"开关移除**：表格换成卡片后该功能无意义。简介仍可通过操作区的"编辑简介"查看/修改。
5. **`window.prompt` 换成 Modal**：添加域名、编辑简介、新建分类、批量分类、批量 DNS。删除确认仍用 `window.confirm`（更安全）。
6. **`PublicPage.tsx` 已删除**，拆成 `HomePage.tsx` + `DomainsPage.tsx`。

未改动：D1 schema、API 契约、登录机制、Cloudflare 配置、部署方式。

## 8. 验证结果

- `pnpm typecheck` / `pnpm lint`：通过。
- `pnpm test`：8 文件 44 项通过。
- `pnpm test:e2e`：Chromium **7 项全部通过**（首页真实统计 / 列表搜索+多标签筛选 / 旧链接重定向 / 后台登录隐藏恢复退出 / 简介与精品前后台同步 / 手机端无溢出 / 桌面端无底部导航）。
- `pnpm build`：通过。JS 82 KB gzip、CSS 8.4 KB gzip，**未新增任何依赖**。
- `pnpm verify:no-demo-data`：扫描 96 个生产文件，无假数据。
- 响应式实测 320 / 375 / 430 / 768 / 1024 / 1280 / 1440 / 1920：**零横向溢出**，列数 1/1/1/2/3/4/4/4，1920 内容锁定 1440px。
- 浏览器 console：全新 tab 零 error、零 warning。

## 9. 已踩过的坑（**不要重复**）

### 本次新增

- **推送前一定先 `git fetch` 看远程有没有前进** —— 本次远程 main 已经领先 2 个提交（多标签 + 3 家注册商），
  如果当时 force push 就会静默删掉这些真实功能。冲突要逐个合并，不能用 `--ours` / `--theirs` 一把梭。
- **新增前台统计接口时，聚合口径必须和筛选接口一致** —— `/overview` 一度还在用旧的 `auto_category` 单分类，
  而 `/domains?category=` 已经改成 `domain_auto_categories` 多标签匹配，导致首页分类点进去是空列表。
- **搜索框没有 submit 按钮时，浏览器隐式提交不可靠** —— 必须在 input 上显式处理 `Enter`（见 `ui.tsx` 的 `SearchBar`），否则回车搜不了。
- **绝对定位的卡片按钮会压住徽章** —— 域名卡无简介时很矮，复制按钮必须作为 flex 列参与排版，不能 `position: absolute; bottom`。
- **CSS grid 列数必须与 JSX 直接子元素数一致** —— `.record` 曾定义 6 列但只有 5 个子元素，导致后台卡片错位、高度暴涨。
- **图标宫格的角标会和图标重叠** —— `.icon-card` 必须 `justify-content: flex-end` + 顶部留 padding。
- **平板隐藏简介列会连带隐藏编辑入口** —— 编辑按钮要放在操作区，不能放在会被隐藏的列里。
- **React 19 没有全局 `JSX` 命名空间** —— 用 `ReactNode`，`JSX.Element` 会 TS2503。
- Vite HMR 会对已删除的文件反复报 "Failed to reload"，那是**幽灵错误**，开新 tab 就没了。别去追。

### 历史（仍然有效）

- `csv-parse/sync` 依赖 Buffer，Workers 必须用 `csv-parse/browser/esm/sync`。
- 超大 SQL 文件会触发 `SQLITE_TOOBIG`；本地用事务，远程用 D1 batch API。
- Cloudflare Vite Plugin 可能把 `.dev.vars` 复制进产物；构建后必须扫描（`scripts/sanitize-build.ts` 已做）。
- CSV 的 Listing Status **不能**当展示开关；只有 Hidden 或管理员设置决定 `is_listed`。
- D1 Query API 批量请求要包成 `{ batch: [...] }`，顶层数组返回 7400。
- Workers 的 PBKDF2 上限 100,000 次，更高会在生产 `NotSupportedError`。

## 10. 本地启动

```bash
pnpm install
pnpm dev                    # http://localhost:5173
```

需要 `.dev.vars`（参考 `.dev.vars.example`）：`ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `SESSION_SECRET` / `CREDENTIALS_ENCRYPTION_KEY`。

本地 D1 已有数据。若为空：

```bash
pnpm db:migrate:local
pnpm domains:import:local
```

## 11. 构建与检查

```bash
pnpm check      # typecheck + lint + test + build + domains:verify + verify:no-demo-data
pnpm test:e2e   # Playwright（会自动起 dev server）
```

**提交前请跑 `pnpm check`。**

## 12. 部署

```bash
pnpm build
wrangler deploy
```

Cloudflare 资源（**不要创建重复资源**）：Worker `wanmi`、D1 `wanmi-db`（绑定 `DB`）、R2 `wanmi-assets`（绑定 `UPLOADS`）、Static Assets `ASSETS`、Cron `0 1 * * *`。

远程 migration：`pnpm db:migrate:remote`。备份：`pnpm db:backup`。

## 13. 下一步建议

1. **补域名简介**：862 条里只有 1 条有 `description`。卡片和详情页已经为简介留好位置，补上内容后前台信息密度会明显改善。
2. **接注册商同步到期时间**：`expires_at` 现在全空，导致"到期提醒"模块和 Cron 实际没有数据可用。在后台"注册商"里添加真实凭据并执行同步即可激活。
3. 六家注册商适配器已实现真实 API 路径，但**未用真实凭据做过线上连接实测**。
4. 若未来补上了跨月的 `created_at` 或估值字段，可以再考虑首页的时间趋势折线 —— 但**在那之前不要画**。
