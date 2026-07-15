# WanMi HANDOFF

## 当前任务与结论

本轮按产品改造清单完成公开站点、管理后台、响应式、SEO、测试和发布链路升级，并已部署到 <https://wanmi.org>。生产 Worker 版本为 `5558ddff-1b91-4525-8c83-77039eab472e`，分支为 `codex/ui-notify-stats-contacts`。

生产 D1 当前为 862 条域名、862 条公开、87 条精品；权威源 `data/source/WanMi.csv` 仍是 859 条有效唯一记录，生产多出的 3 条为历史人工数据，未被导入或迁移覆盖。

## 本轮已完成

### 公开站点

- 将视觉统一为黑金目录风格，新增实时资产 Hero、分类构成、精品卡片、深浅色主题与克制动效。
- 重构公开目录为独立组件：高级筛选、Hero、域名卡片、速览弹窗和移动底栏。
- 新增关键词、后缀、分类、精品、长度区间、包含/排除字符和域名类型筛选；筛选、排序和分页可写入 URL。
- 新增版本化本地收藏、收藏视图、最多 10 条搜索历史、随机发现、复制、联系和相似推荐。
- 速览支持注册/到期日期、分类、相似域名、收藏、复制、联系和完整详情跳转。
- 后台与完整详情按路由懒加载；公开列表缓存少量最近页面，并在网络条件允许时预取下一页。
- 采用服务端分页和 CSS `content-visibility` 控制长列表渲染成本。
- 完成桌面、平板、手机与安全区适配；手机使用单列卡片、底部固定导航和底部抽屉式速览。

### SEO 与 Worker

- `wrangler.jsonc` 让 `/`、`/api/*`、`/d/*`、`/sitemap.xml` 和 `robots.txt` 由 Worker 优先处理。
- 首页由 Worker 注入实时标题、描述、canonical、Open Graph、Twitter Card 和真实域名 `ItemList` JSON-LD，数量与生产 D1 同步。
- 详情页使用 `WebPage` JSON-LD；没有真实公开报价时不输出虚假的 `Product`、库存或价格。
- 保留动态 sitemap 与 robots；React 入口补充 Cloudflare Worker 注入页面所需的 React refresh preamble。

### 管理后台

- 域名管理增加完整服务端筛选、排序、分页、列显示、批量精品/取消精品、上架/隐藏、分类、所选导出。
- CSV 上传先展示总数、有效、无效、重复、新增、已存在、样例和错误；支持冲突“跳过/更新”。
- 后台 CSV 上传不会归档本次文件之外的域名；权威同步脚本仍保留明确的归档语义。
- 操作日志增加动作、关键词、日期、操作者筛选及分页、CSV 导出，并显示操作者邮箱。
- 所有新增管理写操作记录操作者；公开数据版本触发器使已打开前台能够清理缓存并刷新。
- 注册商、DNS 和域名导入代码已改用兼容字段 `registrar_label` 与 `registrar_account_ref`。

### 工具与测试基础设施

- `scripts/backup-d1.ts`：跨平台调用当前 pnpm/Wrangler，导出远程 D1 到被 Git 忽略的 `backups/`。
- `scripts/verify-production.ts`：默认只读；`--write` 使用唯一临时域名验证登录、CRUD、公开同步、批量操作、CSV 预览、导出、操作者日志、清理和退出。
- `scripts/generate-schema-compat-migration.ts`：从权威 CSV 生成 0015 中 859 条注册商标签回填语句。
- `scripts/restore-production-backup-records.ts`：在内存 SQLite 中读取历史 D1 备份，定向恢复注册商账户、线索、DNS 缓存和域名账户关联；支持 `--dry-run`，不会输出敏感内容。
- 集成测试改用 Node.js 内置 `node:sqlite` 模拟 D1，不依赖系统 `sqlite3` 命令。

## 生产数据库迁移与恢复

### 新增迁移

- `0014_black_gold_accent.sql`：只在主题仍为历史默认橙色时切换为金色 `#d8b638`，不覆盖管理员自定义色。
- `0015_restore_domain_management_schema.sql`：幂等恢复 `registrar_accounts`、`dns_records_cache`、`domain_leads`，新增 `domains.registrar_label`、`domains.registrar_account_ref` 与 `domain_import_staging.registrar_label`，并回填权威 CSV 的 859 条标签。

生产迁移账本中存在当前仓库没有的历史 `0008_drop_registrar_dns_leads.sql` 与 `0009_domain_lifecycle_metadata.sql`；它们曾删除注册商/DNS/线索表并改用旧 `registrar` 列。不能复用这些迁移名，也不能假设本地 schema 与生产完全一致。

本轮操作顺序：

1. 在每次生产变更前导出完整 D1 备份；最新迁移前回滚点为被 Git 忽略的 `backups/wanmi-20260715T021244Z.sql`。
2. 远程执行 0014 和 0015；0015 共执行 872 条命令。
3. 从更早的迁移前备份定向恢复 2 条注册商账户、1 条真实求购线索、0 条 DNS 缓存；无域名账户关联需要恢复。
4. 复核域名总量、公开/精品状态不变，未删除、归档或重导生产域名。

备份包含加密凭据和真实联系人，只能保留在被忽略的本地 `backups/` 或受控备份系统中，绝不能提交、粘贴到 Issue/PR 或输出到日志。

## 当前 API 行为变化

- `GET /api/public/domains` 新增 `minLength`、`maxLength`、`contains`、`excludes`、`kind`，保留分页上限与 Zod 校验。
- `GET /api/public/version` 禁止缓存，用于公开端检测 D1 写入版本变化。
- 管理域名创建、修改、导入、导出和注册商同步使用兼容字段，不再依赖生产中不存在的 `registrar_name` / `registrar_account_id`。
- `GET /api/admin/logs` 支持动作、关键词、起止日期和分页；日志导出沿用相同筛选。
- CSV dry-run 返回结构化预览，正式上传在服务端重新解析，不能绕过校验。

## 验证结果

### 本地自动化

- `pnpm check`：通过；包含 TypeScript、ESLint、10 个测试文件 61 项测试、生产构建、859 条本地域名验证和 108 个生产文件无示例数据检查。
- `pnpm test:e2e`：Chromium 5 项通过。
- 响应式自动化覆盖 `1280×720`、`1440×900`、`1920×1080`、`768×1024`、`1024×768`、`320×568`、`375×812`、`390×844`、`430×932`，均检查主内容和横向溢出。
- 构建拆包：公开入口约 238.85 kB、详情约 6.60 kB、后台约 414.16 kB（均为未压缩产物）；构建 Secret 扫描通过。

### 本地真实浏览器

- 桌面首页、包含字符筛选、收藏、域名速览与相似推荐通过。
- 390px 手机底栏、速览抽屉和无横向溢出通过。
- 使用真实本地管理员登录，概览、50 行域名表和带操作者列的日志页通过；控制台无警告或错误。

### 生产验收

- `pnpm verify:production`：健康检查、862 条公开域名、金色主题、实时 ItemList、canonical、详情 WebPage 和 sitemap 全部通过。
- `pnpm verify:production -- --write`：创建、公开同步、批量精品、隐藏/恢复、CSV 预览、所选导出、操作者日志、临时数据清理和退出全部通过。
- D1 `changes` 包含域名更新及 `public_data_version` 触发器更新，单域名批量操作可返回 2；验证器要求至少一条变更并继续核对公开状态。
- 生产真实浏览器：1440×900 首页显示 862/87，无横向溢出；390×844 移动底栏可见且无溢出；后台概览、862 条域名管理、112 条操作日志及操作者列正常；控制台无警告或错误，测试会话已退出。

## 尚未完成 / 有意留后

1. 没有实现多域名对比视图；本轮优先完成 P0/P1 和已明确要求的随机/相似/SEO 能力。
2. 没有引入 JavaScript 窗口虚拟化库；公开 API 每页最多 100 条，当前默认 60 条，服务端分页配合 `content-visibility` 已覆盖现有规模。若未来改为无限滚动，再引入虚拟化。
3. 没有接入独立 AI/向量搜索服务；高级筛选和相似推荐目前完全基于真实字段与确定性规则，避免虚构能力和额外密钥。
4. 六家注册商真实 API 路径已实现且生产兼容表/记录已恢复，但本轮没有可用于各服务商的最小权限真实凭据，因此未执行外部注册商连接、同步和 DNS 写入冒烟。

## 下一步建议

1. 若要验证注册商，先为单一非关键账户配置最小权限凭据，仅测试连接与只读同步，再对测试域名执行 DNS CRUD。
2. 若产品确认需要比较功能，先确定最大比较数量和字段，再基于现有收藏数据实现，不要额外复制域名状态。
3. 每次发布继续执行：远程备份 → migration dry review → `pnpm check` → `pnpm test:e2e` → `pnpm run deploy` → 只读生产验证；需要写验证时显式使用 `--write`。
4. 聊天中曾直接提供长期 Token 和后台密码；本轮结束后必须在 Cloudflare、GitHub 和后台轮换，之后只通过环境变量、Secret 或交互式输入提供。

## 已踩过且不能重复的坑

- Cloudflare Worker 优先返回的根 HTML 需要 React refresh preamble；否则开发模式会报预热缺失。
- `pnpm deploy` 会命中 pnpm 自身命令语义；必须使用 `pnpm run deploy`。
- PowerShell `Invoke-WebRequest` 可能把 HTML 解析为对象；生产验证应使用 Node `fetch` 或 `curl.exe`。
- 不要仅凭本地 migration 文件推断远程 schema；发布前查询 `d1_migrations`、`sqlite_master` 和 `pragma_table_info`。
- 迁移名一旦远程使用就不能复用；兼容不同历史 schema 时应增加两边都不存在的新列，并用 `CREATE TABLE IF NOT EXISTS`。
- `node:sqlite` 读取 D1 导出时应先关闭临时数据库外键检查，否则备份中表创建顺序可能导致回放失败。
- D1 更新触发器会计入 `meta.changes`，不能把批量接口的影响数严格断言为所选 ID 数。
- Wrangler/Vite 构建会检查当前进程是否提供本地 Secret；远程 Worker Secret 独立存在，最终以真实登录和 `wrangler secret list` 验证。
- 备份脚本在 Windows 不应直接 `spawnSync('pnpm.cmd')`；应通过 `process.execPath` 与 `npm_execpath` 调用当前 pnpm。
- 构建后必须运行 Secret 扫描；`.dev.vars`、备份、构建产物和临时凭据都不能进入 Git。
