/* 站点设置 accent_color 的运行时应用。
   雅致绿金主题的默认品牌色链在 tokens.css / app.css 中静态调校（观感最优）；
   管理员自定义颜色时必须整套派生 strong/hover/bg/border/ring，
   只覆盖一个 --brand 会出现「按钮新色、分页/聚焦环仍是旧色」的割裂。 */

/** 当前主题的默认品牌色（tokens.css --brand-primary）。 */
export const THEME_BRAND_HEX = "#133429";

/* 历史各轮主题的默认 accent（珊瑚橙 → 黑金 → 暖金 → 雅致绿金）。
   命中即视为「管理员未定制」，走 CSS 静态令牌；仅真正的自定义色才做动态派生。 */
const HISTORICAL_DEFAULT_ACCENTS = new Set([
  "#f97316",
  "#e85d2a",
  "#d8b638",
  "#b89530",
  "#c4a242",
  THEME_BRAND_HEX,
]);

const ACCENT_PROPERTIES = [
  "--brand",
  "--brand-strong",
  "--brand-hover",
  "--brand-bg",
  "--brand-bg-strong",
  "--brand-border",
  "--brand-ring",
] as const;

function isValidHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** 应用（或清除）管理员自定义强调色；派生规则与 tokens.css 的绿金默认链保持同一透明度节奏。 */
export function applyAccentColor(accent: string | null | undefined): void {
  const root = document.documentElement.style;
  const normalized = accent?.trim().toLowerCase() ?? "";

  if (!isValidHex(normalized) || HISTORICAL_DEFAULT_ACCENTS.has(normalized)) {
    for (const property of ACCENT_PROPERTIES) root.removeProperty(property);
    return;
  }

  root.setProperty("--brand", normalized);
  root.setProperty("--brand-strong", `color-mix(in oklab, ${normalized} 90%, #04120d)`);
  root.setProperty("--brand-hover", `color-mix(in oklab, ${normalized} 72%, #ffffff)`);
  root.setProperty("--brand-bg", `color-mix(in oklab, ${normalized} 8%, transparent)`);
  root.setProperty("--brand-bg-strong", `color-mix(in oklab, ${normalized} 14%, transparent)`);
  root.setProperty("--brand-border", `color-mix(in oklab, ${normalized} 26%, transparent)`);
  root.setProperty("--brand-ring", `color-mix(in oklab, ${normalized} 20%, transparent)`);
}
