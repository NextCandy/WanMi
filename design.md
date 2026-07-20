# Design — WanMi / 玩米

本系统为 **Elegant Green Gold 雅致绿金** 主题（2026-07-20 由浅色暖金改版）：墨绿为主、暖白为底、香槟金点缀。单一浅色主题——不提供暗色模式，不读取系统深浅色偏好（`color-scheme: light` 固定）。所有组件引用根目录 `tokens.css` 变量，禁止硬编码色值。

这是 WanMi 前台、后台与移动端共享的锁定设计系统。后续页面先读取本文件，保持产品一致性。

## Genre

modern-minimal，结构优先；暖白纸感底色、奶油白卡片、深墨绿品牌色与克制的香槟金，呈现专业、稳重、高级、干净的管理系统质感。

## Macrostructure

- 前台：Catalogue；真实域名库存为主体，桌面自适应多列、手机单列。
- 后台：Workbench；深墨绿侧轨、暖白工作区、指标卡、表单和数据记录承担视觉结构。
- 速览与登录：延续 Catalogue/Workbench 的字体、规则和控件语言；登录页为深墨绿场景 + 左右分栏白卡。

## Theme — Elegant Green Gold

色彩比例：暖白米白 ≈70%、墨绿 ≈20%、灰米辅助 ≈8%、香槟金 ≤2%。

| 语义 | 令牌 | 值 |
| --- | --- | --- |
| 页面背景 | `--background` / `--background-soft` | `#f6f5f0` / `#f1efe8` |
| 卡片表面 | `--surface` / `--surface-secondary` / `--surface-elevated` / `--surface-hover` | `#fefdfa` / `#f4f2ec` / `#ffffff` / `#efede6` |
| 品牌绿 | `--brand-primary` / `-strong` / `-hover` / `-secondary` | `#133429` / `#0f3c32` / `#1e6b59` / `#2d4f40` |
| 品牌绿派生 | `--brand-bg` / `--brand-bg-strong` / `--brand-border` / `--brand-ring` | rgba(19,52,41) 8%/14%/26% 与 rgba(30,107,89) 20% |
| 香槟金 | `--gold` / `--gold-deep` / `--gold-bright` / `--gold-soft` | `#c89848` / `#b88038` / `#d8b66f` / `#e8d8b8` |
| 金色文字 | `--gold-text` | `#79551f`（浅底金色小字唯一合法色） |
| 金色派生 | `--gold-bg` / `--gold-bg-strong` / `--gold-border` / `--gold-divider` | rgba(200,152,72) 11%/18% 与 rgba(184,128,56) 38%/30% |
| 文字 | `--text-primary` / `-secondary` / `-tertiary` / `-inverse` / `--text-on-brand` | `#1f2a24` / `#5d675f` / `#7e877f` / `#ffffff` / `#ffffff` |
| 边框 | `--border-subtle` / `--border` / `--border-strong` | rgba(31,42,36) 6%/10%/17% |
| 语义色 | `--success` / `--warning` / `--danger` / `--info` | `#34745a` / `#a76b22` / `#b95343` / `#4e7469` |
| 阴影 | `--shadow-card` / `-hover` / `--shadow-panel` / `--shadow-modal` | 绿倾向 rgba(17,38,30…)，禁止纯黑阴影 |

## 颜色使用规则

1. **墨绿**承担：品牌、主按钮、激活状态、主数据线、链接与聚焦环、当前分页、深色侧栏与登录场景。
2. **香槟金只表达精品与重点资产**：精品星标徽章、精品卡金细边与顶部短金线、精品详情 kicker、后台精品统计卡与精品开关、图表第二数据线、侧栏 active 左侧 3px 金短条、Logo 内芯。
3. 金色**禁止**用于：普通正文、普通分类、普通筛选按钮、TLD 标签、大面积卡片背景、全部菜单激活态。
4. 浅色背景上的金色小字一律 `--gold-text`（`#79551f`），不得直接用 `--gold`/`--gold-bright`；亮金仅可用于深绿底（侧栏、登录介绍区、OG 图）。
5. 卡片阴影统一走 `--shadow-*` 令牌（绿倾向）；禁止 `rgba(0,0,0,…)` 纯黑阴影。
6. 禁止霓虹绿、高饱和荧光色、黑金夜店风、重玻璃拟态与大面积渐变；大面积渐变仅限登录页场景、后台侧栏与深绿总览卡。
7. 普通小字号文本必须满足 WCAG AA。
8. 到期状态分级：>30 天次级文字色、≤30 天 `--warning`、≤7 天与已过期 `--danger`（文案「已过期」）。

## 动态 accent_color

站点设置的 `accent_color` 经 `src/client/lib/accent-color.ts` 的 `applyAccentColor` 应用：

- 命中历史各轮默认色（`#f97316`/`#e85d2a`/`#d8b638`/`#b89530`/`#c4a242`/`#133429`）视为「未定制」，清除覆盖走 CSS 静态令牌（人工调校观感最优）；
- 真正的自定义色会整套派生 `--brand`/`-strong`/`-hover`/`-bg`/`-bg-strong`/`-border`/`-ring`（color-mix），侧栏渐变亦从 `--brand` 派生，不会出现「按钮新色、分页旧色」的割裂；
- 迁移 `0022_elegant_green_accent.sql` 已把历史默认值归一为 `#133429`（沿用 0014 惯例，不动管理员自定义色）；
- 管理员输入过浅的自定义色可能破坏主按钮白字对比度，UI 未做强校验，属已知限制。

## Motion（依 Emil Kowalski 设计工程原则）

- easing 令牌：`--ease: cubic-bezier(.22,1,.36,1)`（强 ease-out，进入/退出/交互一律用它）；`--ease-in-out` 仅用于屏上移动。禁止 `ease-in`。
- 时长令牌：150/200/250ms 三档，UI 动画不得超过 300ms。
- 一律 `transition` 指定具体属性，禁止 `transition: all`。
- 可按元素必须有按压反馈：`:active { transform: scale(.92–.97) }`（元素越小 scale 越深）。
- 位移类 hover（translateY 悬浮）必须包在 `@media (hover: hover) and (pointer: fine)` 内；颜色类 hover 不限。
- 模态用 `@starting-style` 做 `scale(.96)+opacity` 进入，`transform-origin` 保持居中；禁止从 `scale(0)` 出现。
- 高频操作（每日百次级）不加动画；仅动画 `transform`/`opacity`。禁止持续闪烁/呼吸/循环透明度动画。

## Typography

- 英文、数字、UI：Manrope；display 标题与域名大字：Cormorant Garamond。
- 中文与通用 UI：Noto Sans SC，正文不小于 14px。
- 技术数据：IBM Plex Mono，仅用于域名元数据与日志。
- 标题使用正体，不使用斜体标题。

## Search and card actions

- 搜索框占满可用宽度；搜索按钮固定在最右侧（深墨绿底白字），桌面和手机宽度均不超过 80px。
- 域名卡片操作为「访问域名」次按钮（绿字绿边）+ 复制、速览两枚图标。
- 图标按钮必须有 `aria-label` 和 `title`，但不可显示中文文字。
- 不允许出现"我想要"、求购或报价按钮。

## Spacing, motion and performance

- 4px 命名间距，统一来自 `tokens.css`。
- 控件半径 6–15px，目录卡片 17–19px，登录卡 22px；主要手机触控目标至少 44px。
- 长列表使用服务端分页与 `content-visibility`，移动底栏不使用 `backdrop-filter`。
- `prefers-reduced-motion` 和 `prefers-reduced-transparency` 必须有无动画/无透明度退化。

## Responsive

- 必须验证 320、375、390、430、768、1024、1440 和 1920px。
- `html` 和 `body` 使用 `overflow-x: clip`，不得横向溢出。
- 前台手机单列并保留底部导航；速览使用适配手机的原生对话框（底部抽屉式）。
- 后台七个模块在手机端完整可达（侧栏折叠为顶部深绿网格导航），不以横向滚动隐藏核心功能。
- 登录页手机端自动单栏，品牌介绍区压缩置顶，登录按钮至少 44px 高。

## Product boundary

界面和设计稿不得重新引入注册商账户、DNS 管理、求购表单或线索模块。注册商名称仅可作为域名编辑表单中的普通文字资料。
