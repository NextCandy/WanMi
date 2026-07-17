# WanMi HANDOFF

## 最新进度（2026-07-17 · 首页布局与筛选修复）

- 用户反馈三项问题并已全部修复上线：筛选下拉白底不可读、位数筛选只有 2/3 位、首页仍有精选资产区。
- 下拉白底根因：Chromium 在 `select` 自身背景为透明时会把原生弹层退化为白底，而 option 文字继承暗色主题浅色，白底浅字不可读。`:root` 的 `color-scheme: dark` 无法阻止该退化（生产已验证存在仍复现）。修复是给 `select option` 显式深色背景与文字色（app.css 基础层）。
- 位数筛选从 group=two/three（仅 2/3 位）改为直接驱动既有的 `minLength/maxLength` API 参数：全部、1–9 位（等值区间）、10 位以上（仅下限）。与高级筛选共用同一状态，高级面板填入自定义区间时下拉显示禁用的「自定义区间」项。旧 URL `?group=two/three` 在解析时转换为等值区间，不再写回 group；`GroupKey` 收窄为 `all | featured`。
- 移除首页「精选资产」独立区块与 `FeaturedDomainCard.tsx`（方案文档 §1.3 B.5-6）：Hero 之后直接是全部资产列表，精品域名靠主列表卡片的精品标记区分（`.domain-card.featured` 样式保留 14 处）。CSS 用 postcss 移除 22 条整规则、6 条混合规则仅去掉精选选择器。`facets.featured_domains` 仍被空结果推荐使用，API 不动。
- 真实浏览器验证：option 计算样式为 `#1a1a1a/#f5f5f7`；5 位/10 位以上/旧 group=two 三种过滤均返回正确长度的数据；三个前台 E2E 用例单独跑通过。
- 22 张视觉基线按新首页重建，三轮复跑稳定。

## 前序进度（2026-07-17 · 英文字体自托管）

- Manrope 与 IBM Plex Mono 改为自托管 latin/latin-ext 子集（`public/fonts/*.woff2`），`index.html` 移除这两族的 Google Fonts 外链、改 `preload` Manrope，`fonts.css` 在 `app.css` 前由 `main.tsx` 引入。根因：Google Fonts 在中国大陆不可达，此前国内用户完全拿不到 Manrope（域名展示主字体），只能回退系统字体。
- 只自托管英文子集：Manrope 变量字体单文件覆盖 400-800，中文站点实际只触发 latin（约 55KB）。中文 Noto Sans SC 体积过大仍走 Google Fonts + 系统回退，未改 design.md 字体规范。
- 已在模拟国内网络（阻断 Google Fonts）下验证 `document.fonts.check("700 16px Manrope")` 为真、域名元素 computed 字体为 Manrope，且实际只下载命中子集。
- 字体许可证按项目既有惯例（Instrument Serif 已有）补齐：`Manrope-OFL.txt`、`IBMPlexMono-OFL.txt`。抓取逻辑固化为 `scripts/fetch-fonts.ts`（`pnpm fonts:fetch`），Node fetch 不读代理故用 curl。
- 顺带修复域名管理基线的既有隐患：该页是虚拟滚动 + 滚动到底累积加载，fullPage 截图会不断触发加载把页面撑高（900/7531/13736px 乱跳），改为只截视口，五轮复跑稳定。
- 前台 CSS 108.66 → 111.19KB（+2.5KB 为 @font-face 声明）；`pnpm check` 通过，22 张基线已按新字体重建。

## 前序进度（2026-07-17 · CSS 拆分与视觉基线）

- 新增 22 张 Playwright 视觉基线：前台 8 断点 × 首页/精品详情页共 16 张，后台概览/域名管理 × 390/1024/1440 共 6 张。项目此前没有任何视觉回归保障，而后续配色、响应式、交互方案改的全是 CSS。
- 基线稳定性依赖三处处理，改任何一处产品代码前都要留意：首页精选区用 `Math.random` 洗牌（`PublicPage.tsx:156`），测试注入固定种子 PRNG；Hero 数字用 rAF 计数（`CatalogueHero.tsx:29`），`animations:"disabled"` 管不了 rAF，改用 `emulateMedia({reducedMotion:"reduce"})` 走组件自身退化分支；卡片用 `content-visibility`，fullPage 截图前先整页滚一遍再回顶部，否则总高抖动。
- 后台概览页有三处真实动态数据已 mask：`.stats-overview`（今日 PV/UV）、`.admin-two-columns`（访客地区与域名点击计数）、`.activity-list`（相对时间，且每次登录都新增日志）。mask 只遮内容、仍检测布局，已验证未削弱报警能力。
- 拆出 `admin.css`：前台 CSS 135.93KB → 108.66KB（gzip 23.54 → 19.19KB），后台样式 29.07KB 独立 chunk 按需加载。
- 拆分方法是 DOM 探测归类，不是按命名前缀：939 个选择器在真实页面逐个探测，只搬「仅后台匹配」的 252 个。前后台共享选择器实测仅 19 个，留在 `app.css`。因两文件选择器不重叠，`admin.css` 加载顺序不影响前台层叠，无需引入 `@layer`。
- 19 条前后台混用一个声明的规则按选择器拆开分流，典型如 `.domain-name, .stat-card strong, .hero-stats strong, .related-grid a, .kpi-list b, .admin-table td strong { font-family }`。
- 已知未尽事项：约 14 条后台规则（`.admin-main textarea`、`.stat-card small`、`.admin-table th .sort-arrow` 等）因需要特定交互状态才出现、探测未覆盖，保守留在 `app.css`，功能正确但少减约 1KB。改进方向是按选择器的根来判定归属，而非扩大状态探测。
- 生产版本 `a35072f2-5ca1-46bb-9c10-c9ccfc70d319`，`verify:production` 通过；发布前完整备份 `backups/wanmi-20260717T014305Z.sql`（862 域名 + 1992 条分类关联，Git 忽略）。

## 前序进度（2026-07-17）

- 后台域名列表改为每页 100 条累积 + 桌面虚拟滚动：`useVirtualRows` 跟随页面滚动，只渲染视口附近的行，上下用占位行撑高；行高由首个真实行实测，列显示切换后重新测量。
- 虚拟化要求行等高，因此虚拟化状态下关键词强制单行（`.domains-table.is-virtualized`）；720px 以下表格是卡片式布局、行高不定，此时关闭虚拟化直接整段渲染。
- 批量精品/上架/隐藏/删除统一走确认弹窗并显示选中数量；批量分类从 `window.prompt` 改为弹窗选择；选中超过 500 个 id（`bulkDomainSchema` 上限）时前端按 500 自动分批，后端与 schema 未放宽。
- CSV dry-run 主体此前已存在，本轮补齐字段级差异：`diffImportRecord` 与 `ON CONFLICT` 子句同源，只列出 update 模式真正会改写的字段（日期/注册商走 COALESCE，简介/关键词走 CASE WHEN != ''），`category`、`is_featured`、`is_listed` 受保护故不参与比较。
- 操作日志新增 `/api/admin/logs/trend`，按天补齐 7 个点（空白天补 0），前端复用概览页已有的 recharts 折线图；`domains.bulk.delete` 归入"批量"而非"删除"。
- 本轮修复两个真实问题：后台搜索缺少去抖（逐字符触发整页重取，叠加无限滚动后拖垮 dev server）；切换筛选条件不清空选择（批量操作会作用到当前看不见的域名）。
- `pnpm check` 通过：16 个测试文件、108 项测试成功（新增虚拟化区间、分批、导入差异与日志聚合共 30 项）。
- E2E 每个用例单独跑均通过，新增用例覆盖虚拟化生效（渲染行数远少于已加载数）、无限滚动累积、两个批量弹窗、日志趋势图与 768/390px 无横向溢出。
- 已知本地环境问题：整套 E2E 连跑时，`管理员真实登录` 与 `关键词、简介与精品状态` 会在 admin 页之后 `goto` 公开页卡死；该现象在 `main` 上完全一致，与本轮改动无关，CI 上 `main` 为通过状态。

## 前序进度（2026-07-16）

- 87 个 `is_featured=true` 的域名已恢复独立详情页 `/d/:domain`，由 Worker 查询 D1 并完成 SSR；普通域名仍以 301 跳转到 `/domains?q=域名`。
- 详情页已包含 Instrument Serif 大标题、关键词、可选完整简介、后缀/字符数/类型/注册商/更新时间、访问按钮，以及同后缀 3 个和同长度 3 个推荐。
- SEO 已包含详情页 canonical、Open Graph、Twitter Card 和 Product JSON-LD；动态 OG 接口 `/api/public/og/:domain` 返回 1200×630 PNG，并缓存 1 小时。
- `sitemap.xml` 当前包含首页与 87 个精品详情页，共 88 条 URL；速览弹窗仅为精品域名显示“查看详情页”链接。
- 桌面与 390px 手机视口已核验；长域名会换行且没有横向溢出，页脚内容保持居中。
- `pnpm check` 通过：13 个 Vitest 文件、78 项测试全部成功；新增公开链路 Playwright E2E 在本地和 `https://wanmi.org` 均通过。
- GitHub `main` 功能提交为 `a82418e`；本次功能验收时的 Cloudflare 生产版本为 `ca31cbfb-9be2-471a-b921-f9ed8d6bf6e7`，生产验收脚本已通过。

## 前序背景

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
- Vitest：13 个测试文件、78 项通过。
- Playwright：新增精品详情页、OG、sitemap、普通域名重定向和速览入口的完整公开链路 E2E，本地与生产均通过；原有管理员、搜索、卡片、数据刷新与响应式用例继续保留。
- 真实内置浏览器：
  - 1440×900：`mx.ooo` 详情页标题、五项元数据、访问按钮和六个推荐均完整显示；
  - 390×844：长域名 `donghuacheng.com` 自动换行且无横向溢出；
  - 收藏、复制、速览均可用，精品速览显示详情页入口，普通域名不显示；
  - 控制台无应用警告或错误。

## 生产发布

- 本次功能验收时的 Worker 版本为 `ca31cbfb-9be2-471a-b921-f9ed8d6bf6e7`；后续每次 `main` 部署都会生成新版本，以最新部署日志为准。
- 远程迁移：`0016_remove_registrar_dns_leads.sql` 已成功执行；远程迁移列表为空。
- 数据核验：域名/公开/精品为 862/862/87，分类关联为 1992，通知发送历史为 0，外键检查为空。
- 兼容核验：三个被删表均不存在，`namesale.cn.registrar_name` 保留为“易名”。
- 接口核验：健康检查正常；精品详情页返回 SSR、OG Meta 与 Product JSON-LD；普通域名详情链接跳转到目录搜索；OG 为 1200×630 PNG；sitemap 为 88 条 URL；已移除的 RDAP 与求购端点继续为 404。
- 浏览器核验：生产桌面和手机精品详情页、速览入口及长域名换行均通过；生产管理员登录成功，后台只显示七个保留模块，控制台无应用错误。

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
