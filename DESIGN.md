# DESIGN.md — WanMi / 玩米

> 域名展示与管理系统 · Warm Craft 拟物暖色主题 · v3.0(2026-07-18,配色对齐拟物化风格指南参考图)

---

## 1. Visual Theme & Atmosphere

**设计哲学:**「一线成域」×「拟物质感」——以极简线条勾勒数字资产,以真实材质传递信任。米白纸感为底、皮革深棕驱动操作、金色标记精品资产,通过模拟真实世界的材质、光影与物理交互,让用户凭熟悉的视觉隐喻快速理解功能。

**视觉基调:** 温暖、可信、有质感。参考拟物化风格指南(IMG_3490):纸感底色、奶油卡片、皮革按钮、克制的内高光与暖棕投影——数据密度高但不冰冷。

**核心关键词:** 米白纸感 · 皮革深棕 · 奶油浮起卡 · 金标精品 · 暖调光影

**光影质感:**
- 卡片:奶油白渐变面(`rgba(255,255,255,.55)→.15` 叠 surface)+ 强白内高光(`--glass-highlight`)+ 暖棕投影
- 按钮(Primary):深棕实底渐变,模拟皮革;hover 阴影加深、按压 `scale(0.97)`
- 后台侧栏:深棕皮革渐变(`--brand-primary → --brand-primary-ink`),当前项金色高亮
- **禁止**:大面积渐变背景、持续动画模糊、渐变文字(纯文字处不用 gradient)

---

## 2. Color Palette & Roles

### Primary — 皮革深棕(品牌 / 操作 / 选中态)

> 浅色主题下深棕**前景/背景双达标**:作前景(文字/图标/边框)对米白底 8.1:1,作实底配白字 9.7:1。`--brand` 单值双用,由站点设置 `accent_color` 动态覆盖(旧默认值自动跳过)。

| Token | HEX | 用途 |
|-------|-----|------|
| `--brand-primary` | **#5a3e2b** | 主按钮实底、active 胶囊、链接强调、图表主线 |
| `--brand-primary-light` | **#6f4e36** | 按钮渐变亮端(白字 7.5:1)|
| `--brand-primary-deep` | **#3e2a1c** | 按压态、hover 加深(`--brand-strong`)|
| `--brand-primary-ink` | **#2e1e13** | 近黑棕:正文级最强、侧栏渐变暗端 |
| `--brand-bg` | `rgba(90,62,43,0.10)` | 选中行/淡底 |
| `--brand-bg-strong` | `rgba(90,62,43,0.16)` | 激活 pill 淡底 |
| `--brand-border` | `rgba(90,62,43,0.32)` | 聚焦/激活态边框 |

### Accent — 珊瑚红(品牌 logo 节点色,受限使用)

| Token | HEX | 用途 |
|-------|-----|------|
| `--accent` | **#ff5c38** | **仅限** logo 及极小品牌点缀;UI 强调一律用金色/语义色 |
| `--accent-light` | **#ff7a5c** | hover 态 |
| `--accent-bg` | `rgba(255,92,56,0.12)` | 极少使用 |

### Premium — 金色(精品 / 资产语义,拟物参考图金 #D4AF37)

| Token | HEX | 用途 |
|-------|-----|------|
| `--gold` | **#d4af37** | TLD 徽章渐变、精品卡边框、装饰 |
| `--gold-bright` | **#e5c55c** | 渐变亮端、侧栏 active 渐变 |
| `--gold-soft` | **#c4a242** | 渐变暗端 |
| `--gold-text` | **#7d641c** | **浅底金色文字唯一合法值**(4.7:1);gold/gold-bright 禁止直接作浅底文字 |
| `--gold-bg` | `rgba(212,175,55,0.14)` | 精品标签背景 |
| `--gold-border` | `rgba(212,175,55,0.45)` | 精品卡边框 |

### Background & Surface(米白纸感分层)

| Token | HEX | 用途 |
|-------|-----|------|
| `--background` | **#f5e9d6** | 页面根底色(米白纸感)|
| `--background-soft` | **#efe1c8** | 次级区域底 |
| `--surface` | **#fbf5ea** | 卡片/面板(奶油白)|
| `--surface-secondary` | **#f3ead8** | 输入框/次要控件 |
| `--surface-elevated` | **#fdf9f0** | 弹窗/下拉(最亮)|
| `--surface-hover` | **#f1e5cf** | 列表行 hover |

### Border(深棕透明度分级)

| Token | 值 | 用途 |
|-------|-----|------|
| `--border` | `rgba(46,30,19,0.14)` | 默认分割线 |
| `--border-strong` | `rgba(46,30,19,0.24)` | 强调边框 |
| `--border-subtle` | `rgba(46,30,19,0.08)` | 极弱分隔 |

### Text(纸上墨色系)

| Token | HEX | 对比度(vs 页面底)| 用途 |
|-------|-----|------|------|
| `--text-primary` | **#2e1e13** | 13.4:1 | 正文/标题 |
| `--text-secondary` | **#5c4a3a** | 7.0:1 | 次要文字 |
| `--text-tertiary` | **#75644f** | 4.8:1 | 占位符/辅助 |
| `--text-inverse` | **#fbf5ea** | — | 深棕底上的反白文字 |

### Semantic Colors(浅底加深,全部 ≥4.5:1)

| Token | HEX | BG Token | 用途 |
|-------|-----|----------|------|
| `--success` | **#297040** | `rgba(41,112,64,0.12)` | 成功/已上架/正常 |
| `--warning` | **#8a5b10** | `rgba(138,91,16,0.12)` | 警告/即将到期(30d)|
| `--danger` | **#b23327** | `rgba(178,51,39,0.12)` | 错误/已过期/危险操作 |
| `--info` | **#38648f** | `rgba(56,100,143,0.12)` | 信息提示 |

### Sidebar Leather(后台深棕皮革侧栏,拟物参考图侧栏语言)

| Token | 值 | 用途 |
|-------|-----|------|
| `--sidebar-bg-a/b` | `--brand-primary → --brand-primary-ink` | 皮革渐变 |
| `--sidebar-fg` | `color-mix(--text-inverse 82%, transparent)` | 侧栏文字(7:1+)|
| `--sidebar-active-a/b` | `--gold-bright → --gold` | 当前项金色渐变 |
| `--sidebar-active-fg` | `--brand-primary-ink` | 当前项深棕文字(7.6:1)|

### Shadow(暖棕投影 + 白内高光)

| Token | CSS Value | 用途 |
|-------|-----------|------|
| `--shadow-card` | `0 1px 2px rgba(90,62,43,0.10), 0 2px 8px rgba(90,62,43,0.10)` | 默认卡片 |
| `--shadow-card-hover` | `0 10px 24px rgba(90,62,43,0.18), 0 2px 6px rgba(90,62,43,0.12)` | 卡片悬浮 |
| `--shadow-panel` | `0 12px 36px rgba(90,62,43,0.16), 0 2px 8px rgba(90,62,43,0.10)` | 面板 |
| `--shadow-modal` | `0 24px 64px rgba(46,30,19,0.28)` | 模态弹窗 |
| `--glow-gold` | `0 0 18px rgba(212,175,55,0.20)` | 精品卡微光晕(唯一允许的光晕)|
| `--glow-brand` | `0 0 18px rgba(90,62,43,0.16)` | 品牌光晕(极少使用)|
| `--glass-highlight` | `inset 0 1px 0 rgba(255,255,255,0.75)` | 拟物卡顶部内高光 |

---

## 3. Typography Rules

### Font Family

| 角色 | 字体栈 |
|------|--------|
| Display(域名大字/标题)| `"Cormorant Garamond", "Songti SC", "Noto Serif SC", ui-serif, Georgia, serif` |
| UI / 中文正文 | `"Manrope", "Noto Sans SC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| Mono(技术数据/日志)| `"IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` |

### Type Scale

| 层级 | Size | Weight | 用途 |
|------|------|--------|------|
| Display Hero | clamp(28px, 5.4vw, 52px) | 600 | 详情页域名 |
| Display Large | clamp(22px, 2.2vw, 28px) | 600 | 卡片域名主体 |
| Heading 1 | 28px | 600 | 区块标题 |
| Heading 2 | 20px | 550 | 子区标题 |
| Heading 3 | 16px | 650 | 小节标题 |
| Body | 14px | 400 | 正文 |
| Body Small | 13px | 400 | 卡片描述 |
| Caption | 12px | 500 | 标签/元数据 |
| Caption Tiny | 11px | 500 | 徽章/chip |
| Overline | 10px | 700 | 分组标签/kicker(letter-spacing .24em)|

**规则:** display 层级 `lining-nums`;数字数据 `tabular-nums`;标题正体;中文 ≥14px。

---

## 4. Component Stylings

### Buttons

#### Primary(皮革深棕实底)
```css
background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary));
color: #ffffff; border: none;
box-shadow: 0 2px 8px rgba(90, 62, 43, 0.30);
/* Hover: 阴影加深; Active: transform: scale(0.97) */
```

#### Secondary(奶油描边)
```css
background: var(--surface-secondary);
border: 1px solid var(--border-strong);
color: var(--text-secondary);
/* Hover: border-color: var(--brand); color: var(--text-primary) */
```

#### Ghost(文字按钮)
`color: var(--text-secondary)` → hover `color: var(--brand)`

#### Danger
`background: var(--danger); color: #ffffff`

### Cards(域名卡片,奶油拟物)
```css
background: linear-gradient(175deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15)), var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius-lg);
box-shadow: var(--glass-highlight), 0 1px 2px rgba(90,62,43,0.10), 0 4px 14px rgba(90,62,43,0.10);
/* Hover: translateY(-2px) + --shadow-card-hover; Active: scale(0.995) */
/* Featured 变体: 金调渐变底 + --gold-border 边框 + --glow-gold */
```

### TLD Badge(金色药丸,拟物凸起)
```css
color: #3a2c08; background: linear-gradient(180deg, var(--gold-bright), var(--gold-soft));
box-shadow: inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 6px rgba(90,62,43,0.25);
```

### Inputs
```css
border: 1px solid var(--border); background: var(--surface-secondary);
/* Focus: border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-ring) */
```

### Filter Pills(筛选胶囊)
- 常态:`background: rgba(46,30,19,0.04); border: 1px solid var(--border)`
- Hover:`background: rgba(46,30,19,0.08)`
- **Active:深棕实底渐变 + 白字**:`linear-gradient(180deg, var(--brand-primary-light), var(--brand-primary)); color: #fff`

### Stat Cards(后台统计卡,拟物浮起)
```css
.stat-card { background: linear-gradient(160deg, var(--surface-elevated), var(--surface)); border: 1px solid var(--border); }
.stat-card::after { background: radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.55), transparent 55%); }
.stat-card strong { color: var(--text-primary); } /* 衬线大数字 */
/* 精品卡 tone-c: 金调渐变 + --gold-border + --gold-text 数字 */
```

### Admin Sidebar(深棕皮革)
```css
background: radial-gradient(circle at 0% 0%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 46%),
            linear-gradient(180deg, var(--sidebar-bg-a), var(--sidebar-bg-b));
/* 当前项: linear-gradient(180deg, var(--gold-bright), var(--gold)) + 深棕字 */
/* 侧栏内品牌 logo 需奶油底板(var(--surface))保证藏青线条可见 */
```

### Modals
遮罩 `backdrop-filter: blur(8px)`;内容区 `var(--surface-elevated)` + `--shadow-modal` + `@starting-style` 缩放入场(≥0.96)。

### Donut Chart(环形图,后台到期占比)
- 主弧 `var(--warning)`(即将到期)、次弧 `var(--brand)`(正常);中心衬线大数字
- 禁止环形图内渐变填充

### Activity Timeline(操作日志时间线)
- `timeline-dot` 默认 `var(--brand)`,危险操作 `var(--danger)`
- 时间戳 `tabular-nums`

### Expiry Calendar(到期月历)
- 到期日:金色小圆点;紧急(<7天):`var(--danger-bg)` 填充 + `var(--danger)` 描边

### Brand Mark & Iconography

**品牌 Logo「一线成域」**:藏青线条(#22355E)+ 珊瑚红节点(#FF5C38),固定配色,**不**随 `accent_color` 改色。米白底上藏青 10:1 直接裸放;**深棕侧栏上需奶油底板**。

| 场景 | 尺寸 | 说明 |
|------|------|------|
| Header Logo(.brand-icon)| 32×32px | 裸放 |
| 后台侧栏/登录(.brand-mark-img)| 28×28px | 侧栏加 `var(--surface)` 底板 |
| 加载态(.brand-mark-img)| 34×34px | 裸放 |
| Favicon | 32×32px | 居中优化版 viewBox |

资源:`/public/logo.svg` 与 `/public/favicon.svg` 均为**居中 viewBox 版**(`viewBox="98 100 200 200"`),小尺寸下图形饱满居中。`settings.logo_url` 优先,未配置回退 `/logo.svg`。卡片内 `<Star>` = 精品标记,**非**收藏。

**UI 图标**:lucide 全局 `stroke-width 1.75` 圆头;手写图标补全 `fill="none" stroke="currentColor"`;普通图标禁用珊瑚红。

---

## 5. Layout Principles

- **间距**:4pt 基数(`--space-3xs` 4px ~ `--space-2xl` 64px)
- **前台网格**:`repeat(auto-fill, minmax(260px, 1fr))`,最大宽 1460px,桌面横向 42px / 移动 16px
- **后台**:侧栏 228px + 内容自适应
- **Section 间距**:Header→Hero 24px、Hero→列表 32px、列表→页脚 84px;移动端减半

---

## 6. Depth & Elevation

- 层级:Background(0)→ Surface(1–10)→ Dropdown/Tooltip(20–39)→ Sticky Header(40)→ 底部导航(60–79)→ Modal(80+)
- 阴影 6 级:xs(border)→ sm/md(`--shadow-card`)→ lg(`--shadow-card-hover`)→ xl(`--shadow-panel`)→ 2xl(`--shadow-modal`)
- `backdrop-filter` 仅限:导航栏、模态遮罩、搜索栏;移动端底部导航禁用

---

## 7. Do's and Don'ts

### Do's ✅
1. 所有颜色引用 token——组件内禁止硬编码色值(品牌 logo 固定色除外)
2. 圆角 8pt 网格:控件 8~10px、卡片 18~22px、弹窗 22~30px、药丸 9999px
3. 动效只操作 `transform`/`opacity`,时长 ≤300ms,easing 用 `var(--ease)`
4. 可按元素必须有按压反馈 `:active { scale(.92~.97) }`
5. hover 位移包 `@media (hover:hover) and (pointer:fine)`
6. `:focus-visible` 2px outline + offset
7. `prefers-reduced-motion: reduce` 全量降级
8. 移动端触控 ≥44px
9. 文本对比度 ≥4.5:1——**浅底金色文字只许 `--gold-text`**
10. 语义分工:主操作深棕、精品金色、紧急语义色;珊瑚红仅限 logo

### Don'ts ❌
1. 禁止大面积金色渐变/光晕(`--glow-gold` 仅精品卡)
2. 禁止渐变文字
3. 禁止 `transition: all` / `ease-in`
4. 禁止从 `scale(0)` 入场(最低 0.96)
5. 禁止横向溢出(`overflow-x: clip`)
6. **禁止报价/求购/收藏/心愿单等任何延伸模块**——产品边界=「域名展示 + 到期提醒」
7. 禁止明暗切换(单一浅色暖调主题)
8. 禁止 `--gold`/`--gold-bright` 直接作浅底文字色
9. 禁止珊瑚红用于普通 UI(按钮/图标/文字)
10. 禁止高频操作加动画

---

## 8. Responsive Behavior

**断点**:320 / 375 / 390 / 430 / 768 / 1024 / 1440 / 1920px

| 断点 | 行为 |
|------|------|
| ≤768px | 单列卡片、底部导航、侧栏抽屉 |
| 769~1024px | 2~3 列网格 |
| ≥1024px | 4~5 列自适应、完整侧栏 |

字号不随移动端缩小;Display 用 `clamp()` 流式缩放。

---

## 9. Agent Prompt Guide

### Quick Reference

> WanMi 是部署在 Cloudflare Workers 上的中文域名展示与管理系统。**单一浅色拟物暖调主题(Warm Craft)**:米白纸感底(#f5e9d6)、奶油卡片(#fbf5ea)、皮革深棕主操作(#5a3e2b 实底配白字,前景直接可用)、金色精品(#d4af37,浅底文字用 #7d641c)、深棕墨文字(#2e1e13)。后台侧栏深棕皮革渐变 + 金色 active。字体:Manrope + Cormorant Garamond + Noto Sans SC + IBM Plex Mono。圆角 8pt 网格,动效 ≤300ms 只用 transform/opacity。产品边界:只有域名展示和到期提醒,不含售卖/报价/求购/收藏。

### 组件生成提示词速查

- **域名卡片**:奶油渐变底 + 白内高光 + 暖棕投影;金色 TLD 药丸徽章;衬线域名大字;底部精品星标(金)+ 到期日期(30 天内 warning、已过期 danger);hover 浮起 2px;操作图标仅复制/速览两枚
- **搜索栏**:奶油输入底 + 深棕实底搜索按钮;focus 深棕描边 + `--brand-ring` 光环
- **筛选胶囊**:淡棕透明常态,active 深棕实底白字
- **后台仪表盘**:皮革侧栏(金 active)、拟物统计卡(衬线大数字、精品卡金调)、深棕折线图(`var(--brand)`)、金/棕分布条
- **弹窗**:`--surface-elevated` + 模态阴影 + blur 遮罩 + 缩放入场

### 迭代检查清单

1. [ ] 零硬编码色值(搜 `#[0-9a-fA-F]{3,8}`,排除注释/token 定义/logo)
2. [ ] 圆角落在 {8,9,10,11,14,18,22,26,28,30,32,9999}
3. [ ] 无 `transition: all`、无 `ease-in`、≤300ms
4. [ ] 320/375/768/1024 走查无溢出
5. [ ] WCAG AA:普通文本 ≥4.5、大文本 ≥3;金色文字必须 `--gold-text`
6. [ ] 无报价/求购/收藏元素
7. [ ] `prefers-reduced-motion` 降级
8. [ ] `<select>` 的 `<option>` 显式设背景/文字色(Chromium)
9. [ ] `backdrop-filter` 不超过 3 处

---

## 附录 A:品牌图标规范

**「一线成域」SVG**:圆弧(域/globe)+ 折线(一线/连接)+ 珊瑚红节点(活力)。

```
viewBox="98 100 200 200"(居中优化版,logo 与 favicon 统一)
线条: stroke="#22355E" stroke-width="7"(favicon 8)round cap/join
节点: fill="#FF5C38" r="8"(favicon 9)
```

- 固定配色,不随 `accent_color`/主题变色
- 米白底裸放;深棕侧栏上加 `var(--surface)` 奶油底板
- `PublicPage` 头部 `settings?.logo_url || "/logo.svg"`;`FeaturedDomainPage` 加载态与后台品牌标统一用 `.brand-mark-img`

**动态品牌色注入**(`PublicPage.tsx`):`accent_color` 合法 6 位 hex 且**不在旧默认集** `{#2fbf9a, #c4a242, #b89530, #d4b252}` 时才注入 `--brand`;否则回退 CSS 深棕。

---

## 附录 B:从 Dark Vault(v2)迁移的差异对照

| 维度 | Dark Vault v2(已替代)| Warm Craft v3(本文件)|
|------|------------------------|------------------------|
| 主题 | 单一深色玻璃(深墨绿 #0a1211)| **单一浅色拟物暖调(米白 #f5e9d6)** |
| 主色 | 青绿 teal #2fbf9a | **皮革深棕 #5a3e2b**(拟物参考图 Primary)|
| 强调 | 金 #d4b252(暗底亮金)| **金 #d4af37**(浅底文字用 #7d641c)|
| 珊瑚红 | 计划作 CTA(v2.x 草案)| **仅限 logo 节点** |
| 卡片 | 深玻璃 + 白透明高光 | **奶油渐变 + 强白内高光 + 暖棕投影** |
| 后台侧栏 | 扁平浅色覆盖 | **深棕皮革渐变 + 金色 active** |
| 统计卡 | 深绿渐变 + 白字 | **奶油拟物浮起 + 衬线深棕数字** |
| teal 令牌 | 主色 | 仅兼容保留,禁止新用 |

---

*文档版本: v3.0 | 对齐日期: 2026-07-18 | 配色基于拟物化风格指南参考图(IMG_3490):米白纸感 + 皮革棕 + 金;品牌 SVG「一线成域」保持藏青/珊瑚红固定色;全部前景组合实测 WCAG AA 达标*
