# Design — WanMi / 玩米

**Black Gold Domain Asset Vault** —— WanMi 前台、详情、后台与移动端共享的锁定设计系统。
后续任何页面改动都必须先读本文件，保持产品一致性。

> 本文件已于 2026-07-15 全量替换旧的 Hallmark "Paper + Coral" 设计。
> 旧方向（纸白背景、珊瑚橙强调、"禁止金色"）已**作废**，不要再回退。
> 更早的 "Emerald Vault 翡翠绿" 方向同样作废。

## Genre

Premium Black Asset Dashboard / iOS Dark Luxury。
克制、高密度但不拥挤；靠留白、细边框和内高光建立层次，不靠重阴影。

## Macrostructure

- **首页 `/`**：资产总览 Dashboard。亮卡（Hero）+ 三栏指标 + 资产结构 + 最近添加/更新。
- **域名列表 `/domains`**：统计卡 → 搜索 → 一级 Segmented → 二级分类 Chip → 域名卡片网格 → 分页。
- **后台 `/admin`**：左侧窄侧栏 + 顶部工具栏 + 主内容区；手机端侧栏转两行导航（7 个模块）。

**没有站内域名详情页**：点击域名直接在新标签页打开该域名本身（`https://<domain>`，
`rel="noopener noreferrer nofollow"`）。旧的 `/d/<domain>` 链接回落到域名列表并预填搜索词。

## Theme —— 唯一暗色主题

黑金是**单一主题**，没有明暗切换（已移除 ThemeToggle）。全部色值来自 `tokens.css`：

| 角色 | Token | 值 |
| --- | --- | --- |
| 背景（OLED 纯黑） | `--background` | `#000000` |
| 卡片表面（暖黑） | `--surface` | `#151515` |
| 品牌强调（香槟金） | `--gold` | `#D8B638` |
| 主文本 | `--text-primary` | `#F5F5F7` |
| 次文本 | `--text-secondary` | `#A1A1A6` |

- 金色是**唯一**品牌强调色。其他颜色只用于语义状态（success / warning / danger / info）。
- **禁止**：大面积绿色或蓝色、大面积渐变、霓虹发光、赛博朋克风、过度透明的玻璃拟态。
- 金色 Glow 只允许极轻使用（`--glow-gold`），不做强发光。
- 首页 Hero 是唯一的"反差亮卡"（奶油 → 香槟极轻渐变），用于突出资产总数。

## Typography

- **Display（Serif）**：Instrument Serif —— 大号数字、页面主标题、域名详情标题、Modal 标题。
- **UI（Sans）**：Inter + Noto Sans SC —— 正文、菜单、卡片、表单。
- **Mono**：JetBrains Mono —— Whois、DNS、日志等技术数据。
- 字体经 Google Fonts **非阻塞**加载（`preload` + `onload`），源不可达时回退系统字体栈，不阻塞首屏。

## Shape and elevation

- 圆角：Chip/Badge `9999px`、搜索 `20px`、域名卡 `22px`、面板 `26px`、Modal `30px`。
- 阴影一律很弱：`--shadow-card`（内高光 + 低透明外阴影）。禁止重投影。
- hover 只做 `translateY(-2px)` + 阴影加深；触屏设备（`hover: none`）不做位移。

## Motion

- 仅 transform / opacity，150–250ms，缓动 `--ease`。
- 禁止弹跳、旋转、长动画、自动无限动画。
- `prefers-reduced-motion: reduce` 下全部动画降为 0.01ms。

## Responsive

必须验证：320 / 375 / 430 / 768 / 1024 / 1280 / 1440 / 1920。

- 域名网格：`repeat(auto-fill, minmax(280px, 1fr))` → 自动 1 / 2 / 3 / 4 列。
- 桌面内容最大宽度 `1440px`，超宽屏不失控。
- **手机端**：底部固定导航（`--bottom-nav-h` + `env(safe-area-inset-bottom)`），正文必须预留该高度。
- **桌面端**：底部导航隐藏，转顶部导航。禁止桌面端出现悬浮的手机版底部导航。
- `html` / `body` 使用 `overflow-x: clip`；域名文本用 `overflow-wrap: anywhere`。
- 后台七个模块在手机端完整显示为两行导航，不以横向滚动隐藏功能。
- 后台域名列表在窄屏由栅格转为卡片；简介列隐藏时，编辑入口必须仍在操作区可用。

## Shared components

统一位于 `src/client/components/`，**禁止**在页面里重复实现按钮 / 徽章 / 搜索框：

- `ui.tsx` —— SearchBar、SegmentedControl、FilterChips、Badge、EmptyState、ErrorState、SkeletonGrid、Pagination、Modal、SectionHead
- `AppShell.tsx` —— 桌面顶部导航 + 手机底部导航
- `DomainCard.tsx` —— DomainCard（网格）、DomainRow（首页列表）
- `PromptModal.tsx` —— 取代 `window.prompt`（删除确认仍用 `window.confirm`）
- `icons.tsx` —— 全部内联 SVG，24×24 viewBox、stroke 1.75。禁止引入外部图标库或混用其它风格。

## 数据诚实性（硬性约束）

界面不得展示库中不存在的数据。当前 D1 的真实情况：

- **没有估值字段** → 首页不展示任何金额。
- **`created_at` 集中在导入当天** → 不做时间趋势折线（画出来即伪造）。资产结构改用真实的分类 / 后缀 / 长度分布。
- **`expires_at` 为空** → 到期模块显示"暂无到期数据"，不编造。
- **`description` 绝大多数为空** → 域名卡片在无简介时自动收紧，不留大片空白。

新增指标前，先确认字段真实存在且有数据。
