# Design — WanMi / 玩米

这是 WanMi 前台、后台与移动端共享的锁定设计系统。后续页面先读取本文件，保持产品一致性。

## Genre

modern-minimal，结构优先，采用克制的纸张、墨色与金色规则。

## Macrostructure

- 前台：Catalogue；真实域名库存为主体，桌面自适应多列、手机单列。
- 后台：Workbench；侧轨、指标、表单和数据记录承担视觉结构。
- 速览与登录：延续 Catalogue/Workbench 的字体、规则和控件语言。

## Theme

- Paper：`oklch(98.2% 0.006 55)`
- Ink：`oklch(19% 0.012 45)`
- Rule：`oklch(88.5% 0.01 55)`
- Accent：默认 `#d8b638`，强调态 `#a88416`
- 禁止大面积金色渐变、重玻璃拟态、持续模糊、装饰光晕和渐变文字。

## Typography

- 英文、数字、域名：Manrope，域名权重 650–750，`line-height >= 1.18`。
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
