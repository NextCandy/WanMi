# WanMi HANDOFF

## 最新进度（2026-07-17 · 自定义 Logo/Favicon 全链路生效）

- 用户反馈「后台的图标没有更新」：后台站点设置一直支持上传 Logo 与 Favicon 到 R2，`logo_url`/`favicon_url` 也会随公开设置 API 下发，但**前端与 SSR 从未消费这两个字段**——前台 header 硬编码 `/favicon.svg`，后台与 SSR 详情页 brand 硬编码「玩」字块，favicon 永远是默认菱形。上传后全站任何位置都不会变。
- 修复（仍全部回退到默认）：前台 header 改用 `settings.logo_url || "/favicon.svg"`，且 `favicon_url` 存在时运行时替换 `link[rel=icon]`；Worker 首页与 `/d/:domain` 详情页在 HTMLRewriter 中按 `favicon_url` 注入 favicon，首页 `og:image`/`twitter:image` 改用 `logo_url`（新增 `absoluteAsset` 把 `/uploads/...` 相对路径转绝对 URL）；后台侧栏 brand 与 SSR 详情页/客户端详情页 brand 在有 `logo_url` 时显示图片，否则保留「玩」字块。
- `FeaturedDomainDetail.site` 类型同步增加 `logo_url`/`favicon_url`；详情页查询同时取两列。
- 本地用 `/favicon.svg` 作测试值验证了 SSR brand img、favicon 注入与 og:image 绝对化，测试值已还原；生产 `logo_url`/`favicon_url` 仍为 NULL，行为与之前完全一致，用户在后台上传后立即生效。

## 前序进度（2026-07-17 · 辨识度专项后续：E2E 与基线）

- 功能 E2E：登录链路、后台七模块、公开链路全部正常；`管理员真实登录` 用例在本地仍命中 HANDOFF 已记载的 admin→公开页 goto 卡死（`main` 基线一致，CI 上通过），与本轮改动无关。
- 新坑已踩并记录：本机另一目录（`~/Documents/kimi/workspace/wanmi`）残留的 dev server 占着 5173，`playwright.config.ts` 的 `reuseExistingServer: true` 会把整套 E2E 静默打到**旧目录的代码与本地 D1** 上（表现为登录 401/429 与基线全挂）。跑 E2E 前先 `lsof -nP -iTCP:5173` 确认进程工作目录是本仓库。
- 后台概览基线高度漂移根因：`admin-overview` 用 fullPage 截图，`.activity-list` mask 只遮内容不遮高度，活动日志在达到 10 条上限前每次登录都会把页面撑高。本地日志超过 10 条后高度封顶即稳定；重建基线需在日志 ≥10 条后进行。
- 视觉基线 22 张按辨识度专项后的视觉在本机（darwin/arm64）重建，连跑三轮全部稳定；原 win32 基线已是旧视觉，继续保留必然失败，已删除——Windows 本地首次跑会自动重建（Playwright 无基线时写入 actual，二次通过）。CI 依旧整 spec 跳过，不受影响。

## 前序进度（2026-07-17 · 辨识度/清晰度专项）

- 用户反馈：网页内容辨识度不高、看着不清晰。实测确认根因是浅底上大量使用亮金 `#d4b252` 作文字色（对比度仅约 1.9:1）：详情页大标题、「访问域名/访问该域名」按钮、速览价值维度卡大字、关键词 pill、精品卡域名、分页激活态等全部中招。
- tokens.css 新增 `--gold-text`（浅色 `#7d641c`，实测约 5.3:1；暗色 `#e9cd7d`）作为浅底金色文字/文字级边框的唯一合法色；`--gold`/`--gold-bright` 仅留作渐变与装饰。design.md Theme 章节已写入该规则。
- app.css 令牌映射 `--brand-strong`/`--premium-fg` 由 `--gold-bright` 改指 `--gold-text`，全站文字级金色一处修复；精品徽章改 `--gold-text` 实底 + `--text-inverse` 字（暗色自动变深字亮金底）；`--gold-text` 同步到关键词 pill、`domain-visit`、`featured-detail-visit`、copy-filter-link、空态推荐标题。
- 详情页 h1 由亮金改 `--text-primary` 深色并去掉金色 text-shadow；`featured-detail-visit` 的 translateY hover 补回 `(hover:hover) and (pointer:fine)` 门控（项目 Motion 规范）。
- 卡片域名（card-view）从 Cormorant Garamond 衬线改为 Manrope 700：`.domain-name strong`/`.domain-tld` 移除自写 `font-family` 后继承容器——`.public-shell .domain-list.card-view .domain-name` 早已声明 `font-ui` 700 却被 strong 自写字体挡住；compact 视图与 related 卡保持衬线。数字域名（00/008007 等）辨识度提升最明显。
- 三级文字 `--text-tertiary` 浅色 `#86868b`→`#6e6e73`（3.4→4.7:1）、暗色 `#6e6e73`→`#8e8e93`；`--border` 0.08→0.10、`--border-strong` 0.14→0.18、`--border-subtle` 0.04→0.05，卡片轮廓与元数据更清晰。
- 修复真实 bug：`--fg-3` 被 7 处引用（前台详情/后台 admin.css）但从未定义，`var(--fg-3)` 全部无效回退；已在 :root 补 `--fg-3: var(--text-tertiary)`。
- SSR 详情页模板两处全大写英文 kicker（FEATURED DOMAIN ASSET / DISCOVER MORE）仍在产出，与上轮「三处 kicker 删除」决策不一致；已删除模板节点与 `.featured-detail-kicker`/`.detail-kicker`/`.featured-related-heading span` 死 CSS。
- 品牌声明句修正：`862 个精选域名` 改为 `N 个域名，覆盖 M 个后缀，其中 K 个精选`（862 是全部，87 才是精选）。
- 生产 `site_settings.accent_color` 已是 `#c4a242` 与 `--gold` 一致，无需变更；`pnpm check` 全绿；桌面/手机/暗色/速览/详情页截图人工复核通过。

## 前序进度（2026-07-17 · wanmi-final-prompt 方案落地）

- 依用户提供的最终优化方案执行，先逐项核实再实施；两项方案内容已过时（列表页 ItemList JSON-LD 与卡片 hover 位移均已存在），一项明确拒绝：LXGW WenKai（楷体风格与目录信息密度矛盾，3MB + font-display:optional 意味着慢网用户白下载还看不到；保持系统中文字体回退）。
- 字体替换：display 字体 Instrument Serif → Cormorant Garamond（tokens/--font-display、fonts.css 由 fetch-fonts 重新生成、og.ts 的 TTF 与 font-family、api.test.ts 同步、旧文件删除、OFL 补齐）。fetch-fonts.ts 新增 EXTRA_TTF：用旧版 UA 请求 css2 拿 gstatic 静态 Regular TTF（290KB，google/fonts 仓库只有 1.1MB 变量字体，resvg 吃静态更稳）。
- 三处全大写英文 kicker 删除（FEATURED DOMAIN ASSET / DISCOVER MORE / DOMAIN QUICK VIEW）。
- DomainCard 7 个手写 SVG 与底栏 Unicode 字符（⌂/≡）替换为 lucide-react；组件不传尺寸 props，沿用 CSS 对各处 svg 的既有约束；顺手移除「点击速览生成」过时文案。
- 新增品牌声明区（h1「精选域名资产」+ 动态统计句）——上轮删 Hero 后页面没有 h1，此块兼顾 SEO 与新访客认知，克制不做大区块。
- 金色微调：#b89530 → #c4a242（bright #d4b252），生产 site_settings.accent_color 需同步（部署时更新）。
- 暗色模式：tokens.css 末尾按系统 prefers-color-scheme 自动切换（无手动开关），仅颜色令牌分主题；app.css 原 `color-scheme: light` 会盖掉媒体查询，已移到 tokens 分主题声明；view-switch 激活态 white → var(--text-inverse)（暗色下浅底白字不可读）。
- 页首布局修复：header 原为 brand/统计/操作三列 grid，统计删除后「后台」掉进中列，两处 grid-template-columns 收敛为 `1fr auto`。
- 其余：搜索 placeholder 更新、移动端筛选下拉两列 grid、页首「后台」视觉弱化（opacity .62 hover 恢复）、速览 QR 卡片化与价值维度四卡低饱和语义底色、精品详情标题/元数据层级 CSS。
- 方案中跳过项及理由：CSS 拆 6 文件（层叠风险大于收益，admin.css 拆分已用 DOM 探测法完成）、wouter 路由（3 条路由不需要）、类型集中与 testing-library 单测（边际收益低）、公开 API 限流（60/min 会误伤 NAT 出口与正常翻页用户，Workers 无状态内存限流多实例下无效）。SSR JSON 注入与 SPA fallback 经检查本就安全（safeJsonLd 转义 `<`；not_found_handling: single-page-application）。
- 22 张基线按新视觉重建三轮稳定；5 个关键 E2E 通过；`pnpm check` 全绿。

## 前序进度（2026-07-17 · 精简首页与移除 AI 简介）

- 页首中心的域名总数（header-stats）删除；页脚「管理」移至页首右侧并改名「后台」（复用既有 .admin-link 样式与 `show_admin_link_in_footer` 开关，字段名未改）。
- Hero 区整体移除（CatalogueHero.tsx 删除）：页首之下直接是搜索与域名列表。
- 高级筛选整体移除（AdvancedSearchPanel.tsx 删除）：AdvancedFilterValue/EMPTY_ADVANCED_FILTERS 内联进 PublicPage，位数下拉继续驱动 minLength/maxLength；contains/excludes/kind 无 UI 入口但保留 URL 直传兼容。移动底栏「筛选」改为滚动到工具栏。
- 后台 AI 简介功能整体移除：AI 配置模块（AiConfigsPanel/Modal/删除弹窗）、nav 项、域名编辑的「AI 生成简介」按钮、`/api/admin/ai-configs*` 与 `/:id/suggest-description` 路由、domain-description-ai service、shared/ai-config.ts 全部删除；简介字段保留纯手动编辑。后台回到七个模块。
- 新增 `0021_drop_ai_configs.sql`：DROP ai_configs（0018 建、0019/0020 调整过），不影响 domains.description 已有数据。远程已执行。
- 测试同步：domain-description-ai.test.ts 删除；api.test.ts 移除 AI 集成用例（108→101）；E2E 删除「AI 配置独立导航」「批量关键词」（后者依赖远程改版已删的关键词功能，属遗留死用例）两个用例，「关键词、简介与精品状态」重写为「手动简介与精品状态」，「前台高级筛选」改为「前台位数筛选」，管理员登录用例断言 nav 不含 AI 配置。
- CSS 清理 114 条死规则（hero/header-stats/advanced/footer-admin-link/ai-* 等）。
- 22 张基线按新布局重建三轮稳定；5 个受影响 E2E 用例通过；`pnpm check` 全绿（15 文件 101 测试）。

## 前序进度（2026-07-17 · 按 emilkowalski/skills 打磨交互）

- 依 Emil Kowalski 的设计工程 skills（github.com/emilkowalski/skills）审计并修复交互层，本轮改动叠加在另一会话的浅色改版（3dfa368…5fde067，黑金 → 米白纸感 + 深金 #b89530）之上。
- 审计结论：easing/时长令牌本已达标（强 ease-out cubic-bezier(.22,1,.36,1)、全部 ≤250ms、无 ease-in 误用），修复集中在四类：
  - 消灭 4 处 `transition: all`，全部改为指定具体属性；
  - 按压反馈补齐至 14 处 `:active`（卡片图标 scale .92、搜索/访问按钮 .97、分页/视图切换/联系图标等），搜索按钮原来的 `translateY(0)` 按压改为 scale；
  - 位移类 hover（translateY 悬浮）全部收进 `@media (hover: hover) and (pointer: fine)`，并删除门控外与门控内重复定义的 `.domain-card:hover`（触屏误触发源）；
  - 速览 dialog 补 `@starting-style` 进入动画：scale(.96)+opacity、200ms、backdrop 同步淡入；modal 保持居中 origin。
- design.md 已同步浅色现实（原文写黑金，与代码脱节）：Theme 章节改为 Warm Light 并新增 Motion 规范章节（禁 transition:all、禁 ease-in、按压反馈必备、hover 位移门控、modal @starting-style 进入等），后续改动以此为准。
- 远程浅色改版删了收藏与「复制链接」、精品标记 dot 改 badge，但 E2E 未同步，本轮修复三处：卡片按钮 3→2、`.domain-featured-dot`→`.domain-featured-badge`、删除复制链接断言；「前台高级筛选、搜索历史与域名速览」用例去掉收藏段落并更名。
- 22 张视觉基线按浅色主题全部重建，三轮复跑稳定；三个前台 E2E 单独跑通过。

## 前序进度（2026-07-17 · 首页压缩与分类下拉）

- 用户要求继续压缩首页：Hero 高度从 700px+ 压至约 366px（1440 宽实测），min-height 移除、padding/gap/字号/统计卡内边距整体收紧，1440×900 首屏可直接看到域名列表。
- 移除 Hero 下的快捷分类链接行（全部/纯字母/纯数字/拼音/精品）与 `QUICK_LINKS` 常量。
- 移除「全部资产」标题行与分类 pills 行（category-rail）及「更多分类」抽屉（categoryOpen 状态、ESC 处理一并清理）；`domain-section` 改用 `aria-label` 命名。
- 新增「分类」下拉到筛选工具栏（最前）：复用既有 `categories` 数据与 `selectCategory`，选项含全部/精品/全部分类及计数（本地 21 项），精品对应 `category=精品` URL 序列化不变。
- 「复制链接」按钮从标题行移入工具栏右侧汇总区（视图切换旁）。
- `CATEGORY_ICONS` 与 categories 的 icon 字段成为死代码一并删除；CSS 用 postcss 移除 72 条死规则（hero-quick-links、asset-section-heading、category-rail/item/drawer 等），`copy-filter-link` 样式保留。
- 22 张基线按新首页重建三轮稳定；三个前台 E2E 单独跑通过。

## 前序进度（2026-07-17 · 首页布局与筛选修复）

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

- Playwright 截图基线按 平台+浏览器 命名（`*-chromium-win32.png`）；本地 Windows 生成的基线在 Linux CI 上永远找不到对应文件而必然失败，且字体渲染逐像素不同也无法跨平台比对。视觉基线 spec 顶部已 `test.skip(!!process.env.CI)`，新增视觉基线 spec 必须沿用；CI 全红时优先检查是不是又有人提交了带截图断言的用例。CI 的 verify 挂掉会连带 deploy job 不触发 —— main push 自动部署是本仓库的原有设计。

- 不要从落后功能分支直接发布；先比较 `origin/main`、当前分支和共同祖先。
- 不要用 GitHub 内容 API重写中文源码；发布前必须执行 UTF-8、类型、测试和构建检查。
- D1 远程曾执行过仓库当前不存在的历史迁移，不能只按本地文件推断列名。
- `DROP TABLE domains` 会触发外键级联；重建前必须保护所有仍需保留的子表数据。
- 页面性能策略不再承诺 8–10 秒自动刷新；后台修改后手动刷新立即生效，自动检查为可见状态下每 60 秒一次。
- Token 和后台密码曾出现在聊天中；本轮完成后应在 Cloudflare、GitHub 和后台轮换。
