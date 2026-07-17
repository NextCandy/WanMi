# Design — WanMi / 玩米

本系统为浅色暖金主题（2026-07-17 由黑金改版），暗色跟随系统 prefers-color-scheme 自动切换（无手动开关），仅颜色令牌分主题。所有组件引用 `tokens.css` 变量，禁止硬编码色值。

这是 WanMi 前台、后台与移动端共享的锁定设计系统。后续页面先读取本文件，保持产品一致性。

## Genre

modern-minimal，结构优先，采用米白纸感底色、纯白卡片与暖金强调的克制规则；暗色下为近黑底与亮金。

## Macrostructure

- 前台：Catalogue；真实域名库存为主体，桌面自适应多列、手机单列。
- 后台：Workbench；侧轨、指标、表单和数据记录承担视觉结构。
- 速览与登录：延续 Catalogue/Workbench 的字体、规则和控件语言。

## Theme — Warm Light

- Background：`#f7f7f5`（米白纸感）/ `#efefed`（次级底）
- Surface：`#ffffff`（卡片）/ `#f3f3f1`（次级表面）
- Brand Gold：`#c4a242`（浅色主题）/ `#d4b252`（暗色主题），唯一强调色
- Text Gold：`--gold-text`（浅色 `#7d641c` / 暗色 `#e9cd7d`）——浅底上一切金色**文字与文字级边框**必须用它（对比度 ≥4.5:1）；`--gold`/`--gold-bright` 仅作渐变、装饰与深色底用途，禁止直接作浅底文字色
- Border：`rgba(0,0,0,.10)`，强调边用 `color-mix(in oklab, var(--gold-text) 42%, transparent)`
- 禁止大面积金色渐变、重玻璃拟态、持续模糊、装饰光晕和渐变文字。

## Motion（2026-07-17 · 依 Emil Kowalski 设计工程原则）

- easing 令牌：`--ease: cubic-bezier(.22,1,.36,1)`（强 ease-out，进入/退出/交互一律用它）；`--ease-in-out` 仅用于屏上移动。禁止 `ease-in`。
- 时长令牌：150/200/250ms 三档，UI 动画不得超过 300ms。
- 一律 `transition` 指定具体属性，禁止 `transition: all`。
- 可按元素必须有按压反馈：`:active { transform: scale(.92–.97) }`（元素越小 scale 越深）。
- 位移类 hover（translateY 悬浮）必须包在 `@media (hover: hover) and (pointer: fine)` 内；颜色类 hover 不限。
- 模态用 `@starting-style` 做 `scale(.96)+opacity` 进入，`transform-origin` 保持居中（模态不做 origin-aware）；禁止从 `scale(0)` 出现。
- 高频操作（每日百次级）不加动画；仅动画 `transform`/`opacity`。

## Typography

- 英文、数字、UI：Manrope；display 标题与域名大字：Cormorant Garamond（Instrument Serif 已于 2026-07-17 替换）。
- 中文与通用 UI：Noto Sans SC，正文不小于 14px。
- 技术数据：IBM Plex Mono，仅用于域名元数据与日志。
- 标题使用正体，不使用斜体标题。

## Search and card actions

- 搜索框占满可用宽度；搜索按钮固定在最右侧，桌面和手机宽度均不超过 80px。
- 域名卡片只显示三枚小图标：收藏、复制、速览。
- 图标按钮必须有 `aria-label` 和 `title`，但不可显示中文文字。
- 不允许出现“我想要”、求购或报价按钮。

## Spacing, motion and performance

- 4px 命名间距，统一来自 `tokens.css`。
- 控件半径 6–15px，目录卡片 17–19px；主要手机触控目标至少 44px。
- 动画仅用于短暂状态反馈；常态卡片不做逐项入场动画、位移悬停或大面积阴影。
- 长列表使用服务端分页与 `content-visibility`，移动底栏不使用 `backdrop-filter`。
- `prefers-reduced-motion` 和 `prefers-reduced-transparency` 必须有无动画/无透明度退化。

## Responsive

- 必须验证 320、375、390、430、768、1024、1440 和 1920px。
- `html` 和 `body` 使用 `overflow-x: clip`，不得横向溢出。
- 前台手机单列并保留底部导航；速览使用适配手机的原生对话框。
- 后台七个模块在手机端完整可达，不以横向滚动隐藏核心功能。

## Product boundary

界面和设计稿不得重新引入注册商账户、DNS 管理、求购表单或线索模块。注册商名称仅可作为域名编辑表单中的普通文字资料。
