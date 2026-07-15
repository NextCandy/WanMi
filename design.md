# Design — WanMi / 玩米

这是 WanMi 前台、后台与移动端共享的锁定设计系统。后续页面先读取本文件，保持产品一致性。

## Genre

modern-minimal，采用 Hallmark 的克制、结构优先与反模板化原则。

## Macrostructure family

- 前台目录：Catalogue；真实域名库存是主体，4 列桌面、1 列手机。
- 后台应用：Workbench；侧轨、指标横条、规则分区和数据记录承担视觉结构。
- 详情与登录：延续 Catalogue/Workbench 的字体、规则和控件语言。

## Theme

- Paper：`oklch(98.2% 0.006 55)`
- Ink：`oklch(19% 0.012 45)`
- Rule：`oklch(88.5% 0.01 55)`
- Accent：黑金体系，默认 `#d8b638`，强调态 `#a88416`，每屏占比保持克制。
- 禁止大面积金色渐变、重玻璃拟态、廉价装饰光晕和渐变文字；只允许细金边、柔和焦点辉光与微量高光。

## Typography

- 英文、数字、域名：Manrope，域名权重 650–750，`line-height >= 1.18`，禁止裁切下伸部。
- 中文与通用 UI：Noto Sans SC，正文不小于 14px。
- 技术数据：IBM Plex Mono，仅用于域名元数据、DNS 与日志。
- 标题一律正体，不使用斜体标题。

## Spacing and shape

- 4pt 命名间距，统一来自 `tokens.css`。
- 控件半径 6px，目录卡片 8px；避免所有内容都成为大圆角浮层。
- 主要触控目标在手机端至少 44px。

## Motion

- 仅 transform 与 opacity，160/220/280ms。
- 不使用弹跳；`prefers-reduced-motion` 退化为 ≤150ms 透明度变化。

## Responsive

- 必须验证 320、375、414、768px。
- `html` 和 `body` 使用 `overflow-x: clip`。
- 前台手机单列；后台表格在手机转为结构化记录卡。
- 后台十个模块在手机端完整显示为两行工具导航，不以横向滚动隐藏功能。

## Shared components

- N9 Edge-aligned minimal 前台导航。
- Ft2 Inline single-line 页脚，手机转纵向。
- 后台浅色 Workbench 侧轨；活跃项使用左侧金色规则。
- 输入、选择、按钮使用同一高度、边框和焦点环。
