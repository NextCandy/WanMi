# UnUseDomain

UnUseDomain 是部署在 Cloudflare Workers 上的中文域名展示与管理系统。公开站点用于检索、收藏、速览和访问已上架域名；管理后台负责域名、分类、CSV、站点设置、到期提醒、通知、安全与审计日志。前端、Worker API、Cloudflare D1 与 R2 同源部署。

## 线上环境

- 生产站点：<https://unusedomain.com>
- 管理后台：<https://unusedomain.com/admin>
- Worker：`wanmi`（为避免新建 Worker 后丢失现有 Secrets 与自定义域名绑定，保留此历史生产资源 ID）
- D1：`wanmi-db`（绑定 `DB`，保留现有生产数据）
- R2：`wanmi-assets`（绑定 `UPLOADS`，保留现有上传文件）
- Cron：每天 `01:00 UTC`，即 `Asia/Shanghai 09:00`
- 当前设计基线：Elegant Green Gold 雅致绿金主题（2026-07-20，由浅色暖金改版）——墨绿为主、暖白为底、香槟金点缀；域名简介为纯手动维护（AI 生成已于 2026-07-17 移除）

权威业务源为 `data/source/UnUseDomain.csv`：859 条有效唯一记录。生产库还保留 3 条历史人工域名，因此线上合计 862 条；迁移与发布不得覆盖或归档这 3 条记录。

## 品牌与图标

- 对外品牌、网页标题、管理后台、通知和下载文件名统一使用 `UnUseDomain`；生产域名统一为 `unusedomain.com`。
- 版权文字统一为 `© 2026 UnUseDomain`（0029 迁移去掉了原先的 `. All rights reserved.` 后缀）。
- 品牌标志为「对分圆环」：圆环沿竖轴对分，左半石墨灰 `#3B3E47`、右半靛蓝 `#233393`，固定配色，不随 `accent_color` 变化。
- `public/` 下全部图标由同一张 1092×1092 透明原图确定性生成，分两组：`unusedomain-logo.png`（512）、`favicon-16/32/48.png` 与含 6 档条目的 `favicon.ico` 为**透明底**，供页内品牌标与浏览器标签使用；`apple-touch-icon.png`（180）、`icon-192.png`、`icon-512.png` 为**白底**，因为 iOS 会把透明合成为黑色、PWA `purpose: "any maskable"` 需要不透明底并把内容收进 80% 直径的安全区。
- 站点设置通过品牌迁移指向这些静态资源；后台上传的 `logo_url`/`favicon_url` 优先级高于静态默认值。
- Cookie、浏览器存储键、缓存标记与诊断 Header 使用 `unusedomain` 命名；品牌迁移会使旧管理会话失效一次，需要重新登录。

## 产品边界

当前产品明确不包含以下能力：

- 求购表单、报价、线索存储及相关 API；
- DNS 查询、缓存、写入和管理界面；
- 注册商账户、凭据、同步及服务商适配器。

域名可保留 `registrar_name` 纯文字资料，用于记录该域名的注册商名称，但它不关联账户或外部 API。旧版相关端点均返回 404；`0016_remove_registrar_dns_leads.sql` 会删除历史表与关联字段，同时保留域名、分类、通知历史和注册商文字资料。

## 设计系统

- 仅提供单一浅色「雅致绿金」主题，不提供明暗主题切换，也不读取系统配色偏好。
- 根目录 `tokens.css` 是唯一设计令牌源；组件与运行时样式只引用 CSS 变量，不硬编码色值。
- 暖白背景 `#f6f5f0`、奶油白卡片 `#fefdfa`，品牌主色为深墨绿 `#133429`（hover `#1e6b59`），香槟金 `#c89848` 仅表达精品与重点资产（占比 ≤2%），浅底金色小字一律 `--gold-text #79551f`。
- 主、次、三级文字依次使用 `#1f2a24`、`#5d675f`、`#7e877f`；卡片阴影统一为绿倾向低透明度令牌，禁止纯黑阴影。
- 站点设置 `accent_color` 由 `applyAccentColor` 整套派生（主色/hover/bg/border/ring 同步），历史默认值视为未定制。
- 保留 `prefers-reduced-motion` 与 `prefers-reduced-transparency` 退化；完整规范见 [`DESIGN.md`](DESIGN.md)。

## 公开站点

- 搜索与筛选：关键词、分类（下拉含全部/精品/各分类及计数）、后缀、位数（全部、1–9 位与 10 位以上，驱动 minLength/maxLength），状态同步到 URL；高级筛选面板已移除，`contains`/`excludes`/`kind` 与旧链接的 `group=two/three` 仍可通过 URL 直传兼容。
- 默认排序（`publicDefaultOrderSql`）：精品优先，且两组各按各的规则——精品组只按位数升序（短的在前），普通组只按后缀优先级（com/cn/net/org/io/is/do/其他）。两个排序键都用 `CASE WHEN is_featured` 兜住，不属于本组的行取 NULL；因为 `is_featured DESC` 已把两组彻底分开，各自的 NULL 不会干扰另一组的组内次序。
- 首页无 Hero：页首（品牌 Logo + 右侧域名总数与「后台」入口）之下直接是搜索与域名列表；无独立精选区块、无分类 pills 行、无「全部资产」标题行；精品域名以主列表卡片上的精品标记区分。页脚不再有管理入口。
- 页脚为三栏：左侧友情链接、中间品牌 Logo 与版权、右侧联系方式小图标（原先在页首右上角，已整体下移）。三栏的列号写死为 1/2/3，左右两列同为 `1fr`，因此没有友情链接时中栏仍落在页脚正中、联系方式仍靠右，不会因为少一个子元素而顺次前移。窄屏（≤900px）沿用同一套列模板，靠压缩内容让位：带 LOGO 的友链收成纯图标、中间只留品牌 Logo 不显示版权文字，联系图标保持一排。
- 搜索按钮固定为右侧 72px 紧凑按钮，不再拉伸占据工具栏。
- 每张域名卡片底部仅保留收藏、复制、速览三枚图标；无可见中文按钮文字，也没有“我想要”。
- **前台界面文案全部为英文**（搜索、筛选、分页、速览弹窗、精品详情页与 SSR、页面标题与 OG 描述）；分类值仍以中文存库、后台照常中文管理，前台由 `src/client/lib/category-label.ts` 做展示层映射（纯字母→Letters、三拼→3 Pinyin…），未覆盖的新分类原样透出。拼音含义模块保留汉字释义——那是内容而非界面语言。
- 站名（页首品牌名与页脚版权）走文字流光：`background-clip: text` + 墨绿→香槟金→墨绿的渐变横向循环，`prefers-reduced-motion` 下停到静止渐变。域名卡片不做流光。
- 卡片高约 150px：简介为空时整段不渲染（不再留占位行），内边距与行距同步收紧；徽章行为「精品星标 + 后缀 + 域龄」，分类徽章已移除，精品仅由星标表达、域名文字用深墨绿加重（不再用金色，在浅底上更稳）。域龄由 `registered_at` 折算整年，显示为 `Age17Years`（不留空格），满 10 年转金色；剩余有效期显示为 `N Days`。
- 点击域名名称直接在新标签页访问对应域名；站内保留原生 `dialog` 速览，精品域名速览额外提供独立详情页入口。
- 收藏和最近搜索仅保存在当前浏览器的版本化 `localStorage` 中。
- 单一黑金主题、随机发现、相似域名、桌面/平板/手机响应式布局与无障碍标签。
- Worker 为首页注入 canonical、Open Graph 和真实域名 `ItemList` JSON-LD。
- 87 个精品域名拥有 Worker SSR 独立页 `/d/:domain`，包含完整资料、同后缀/同长度推荐、Open Graph 与 Product JSON-LD；普通域名访问该路径时重定向到 `/domains?q=域名`。
- `/api/public/og/:domain` 为精品域名生成 1200×630 黑底金字 PNG；`sitemap.xml` 从 D1 动态输出首页和全部 87 个精品详情页。

## 性能策略

- 样式按域拆分：`app.css` 为前台与共享层，`admin.css` 为后台专属层，随已懒加载的 `AdminApp` 按需加载，不进前台首屏（前台 CSS 135.93KB → 108.66KB，gzip 23.54 → 19.19KB）。
- 全部字体自托管，Google Fonts 在中国大陆不可达，外链会让国内用户完全拿不到。分两组：
  - `src/client/styles/fonts.css` 由 `pnpm fonts:fetch` 生成（Manrope、IBM Plex Mono 等 OFL 字体的 latin/latin-ext 子集），**不要手改**。
  - `src/client/styles/brand-fonts.css` 只放英文 Averia Serif Libre Light（OFL，37KB），随前台加载。
  - 中文仓耳华新体（仓耳字库商业授权，站点所有者已确认取得网页嵌入授权；原始 TTF 不入库）的 `@font-face` 放在 `admin.css`，**只随后台加载**。两份都由 `pnpm fonts:brand -- --cjk <中文TTF> --latin <拉丁TTF>` 生成。
- 中文字体必须子集化：全字库 28565 字、17MB，按「源码里出现的汉字 + GB2312 一级字库 3755 常用字 + 常用标点」裁到约 815KB。
- 中文字体不进前台：前台文案与库内简介均已英文化（`0030_english_descriptions.sql` 翻掉了仅有的两条中文简介），前台不再出现汉字，815KB 的中文子集只随 `admin.css` 进后台。此前它会因为一条中文简介被整体拉下来，字体换上时整屏文字跳一次——即用户可见的"刷新闪动"。若日后前台又出现中文（例如友情链接名），按 `tokens.css` 的系统中文字体栈渲染，不会再触发下载。
- 边缘缓存键除 `public_data_version` 外还带构建标识 `__bv`（`vite.config.ts` 的 `define` 注入，CI 用提交 SHA）：数据版本只在数据改动时自增，改排序、序列化这类纯代码逻辑不会碰它，没有构建标识时部署后仍会命中旧响应直到 `s-maxage` 到期。
- 拆分依据是真实页面的 DOM 探测而非命名前缀：只有「前台完全不匹配、仅后台匹配」的选择器才进 `admin.css`。实测前后台共享选择器仅 19 个（`html`/`body`/`button`/`.brand`/`.secondary-button`/`.pagination` 等），全部留在 `app.css`；两个文件选择器不重叠，因此 `admin.css` 的加载顺序不影响前台层叠。注意 `.admin-link` 是前台页脚的管理入口，不可按前缀误判为后台样式。
- 后台域名列表每页 100 条服务端分页，滚动到底自动累积下一页；桌面按视口虚拟化渲染，行高由首行实测得出。
- 720px 以下表格切换为卡片式布局、行高不定，此时关闭虚拟化直接整段渲染；宽表格只在自身容器内横向滚动，页面本身不横向滚动。
- 后台搜索输入去抖 300ms，避免逐字符重置累积列表。
- 公开列表默认每页 36 条，服务端分页；不预取下一页。
- 最近请求缓存最多 20 项，失败请求自动移出缓存。
- 数据版本检查从 8 秒降为 60 秒，并且只在页面可见时执行；后台修改可通过刷新立即读取。
- 卡片使用 `React.memo`、`content-visibility` 与布局隔离；关闭卡片入场动画、重阴影、位移悬停和移动底栏模糊。
- 管理后台按路由懒加载，不进入公开首页首包。

## 管理后台

后台固定为七个模块：概览、域名、分类、站点设置、到期提醒、账户安全、操作日志。

- PBKDF2 密码、HMAC 会话、CSRF、防暴力登录、会话撤销与改密；
- 域名 CRUD、服务端筛选/排序、可选简介（纯手动填写）、生命周期文字资料、精品、上架状态和批量操作；
- 批量精品、上架、隐藏和删除走统一确认弹窗，显示选中数量与即将执行的动作；批量设置分类可选现有分类或新建；选中数超过后端 500 个 id 的上限时前端自动分批提交；切换筛选条件会清空选择，避免误伤当前看不见的域名；
- CSV 导入先 dry-run 预览：展示将新增、已存在、字段冲突、无效与文件内重复的条数，并按字段列出会被改写的新旧值；dry-run 不写数据库，确认后才执行真实导入；
- 操作日志顶部提供近 7 天操作趋势折线图，并按创建/更新/删除/批量分组计数；
- CSV 预览、跳过/更新冲突及导入错误下载；
- 站点资料和 R2 图片；
- 站点设置页内的友情链接管理：增删多条，每条可改名称、地址、LOGO 地址、排序，以及显示形式（LOGO + 文字 / 仅 LOGO / 仅文字），保存后即时反映到前台页脚左栏；
- Email、Telegram、Bark、Server酱、企业微信、飞书、Discord 通知；
- 操作日志筛选、分页与 CSV 导出。

## 技术栈

React 19、TypeScript 6、Vite 8、Cloudflare Vite Plugin、Hono、Workers Static Assets、D1、R2、Cron Triggers、Zod、Vitest 和 Playwright。

## 本地开发

要求 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm domains:validate
pnpm domains:import:local -- --dry-run
pnpm domains:import:local
pnpm dev --host 127.0.0.1
```

本地 Vite 默认关闭 Cloudflare 远程 binding 代理，避免开发与 CI 依赖线上凭据。

`.dev.vars` 必须提供 `ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`、`SESSION_SECRET` 和 `CREDENTIALS_ENCRYPTION_KEY`，且已被 Git 忽略。首次使用某个管理员邮箱登录时才会创建该账号；部署不会重置已有密码。

## 验证与部署

```bash
pnpm check
pnpm test:e2e

pnpm exec wrangler whoami
pnpm db:backup
pnpm db:migrate:remote
pnpm run deploy
pnpm verify:production
```

`pnpm check` 包含类型检查、ESLint、单元/集成测试、生产构建、859 条本地域名验证和生产文件扫描。生产变更顺序固定为：完整 D1 备份 → 检查待执行迁移 → 远程迁移 → 部署 → API、桌面、手机和后台验收。

本轮关键迁移：

- `0015_restore_domain_management_schema.sql`：仅作为历史列名兼容桥，为全新安装准备临时文字列并回填权威 CSV；不会恢复被移除的业务表。
- `0016_remove_registrar_dns_leads.sql`：兼容历史线上和全新安装两种 schema，规范化 `registrar_name`，重建导入暂存表，删除注册商账户、DNS 和求购线索表，并保护分类与通知历史。
- `0017_domain_keywords_field.sql`：为域名和导入暂存记录增加逗号分隔关键词，按中英文逗号与顿号迁移有效简介，同时完整保留原 `description`。
- `0026_unusedomain_rebrand.sql`：统一生产站点名称、Slogan、版权、Logo 与 Favicon，同时保留联系方式、主题色、展示密度和其他管理员设置。
- `0028_friend_links.sql`：新建 `friend_links` 表承载页脚友情链接（名称、地址、LOGO、显示形式、排序），并写入首条「大佬论坛」；只新增表，不触碰既有数据。
- `0029_footer_copyright_trim.sql`：把页脚版权的 `. All rights reserved.` 后缀去掉，只保留 `© 2026 UnUseDomain`；用 REPLACE 而非整句覆盖，后台改过前半段时不会被抹掉。
- `0030_english_descriptions.sql`：把全站仅有的两条中文简介（`mx.ooo`、`namesale.cn`）翻成英文，使前台彻底无汉字；以当前值为条件，后台改过则跳过，不覆盖人工编辑。

所有远程 Token 只能通过环境变量、CI Secret 或交互式输入提供。不得写入 README、`.dev.vars.example`、Wrangler 配置、构建产物、Issue 或日志；聊天中暴露过的长期凭据应在发布后轮换。

## 目录

```text
src/client/            React 公开站点与管理后台
src/worker/            Hono Worker、认证、API 与通知服务
src/shared/            CSV、导入计划、Schema 和共享类型
scripts/               数据导入、验证、备份与安全扫描
migrations/            D1 migrations
data/source/           权威 CSV
tests/                 单元、集成与 Playwright E2E（含 22 张视觉基线截图）
docs/                  部署、导入与安全文档
```

详细说明见 [Cloudflare 部署](docs/CLOUDFLARE_DEPLOY.md)、[域名导入](docs/DOMAIN_IMPORT.md)、[安全设计](docs/SECURITY.md)、[设计规范](DESIGN.md) 与 [HANDOFF](HANDOFF.md)。
