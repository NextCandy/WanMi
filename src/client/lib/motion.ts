/**
 * 动效常量的单一来源。
 *
 * 数值与 tokens.css 的 --dur-* / --ease 一一对应：CSS 动画读令牌，JS 驱动的动画
 * （count-up、图表首绘）读这里，两边改一处不同步的问题才不会发生。
 *
 * 不引入 framer-motion：本项目的动画都能用 CSS transform/opacity 表达，为此多打
 * 40KB gzip 不划算（README 的性能策略对首包体积有明确要求）。
 */

/** 与 tokens.css --dur-1/2/3 对齐 */
export const DURATION = {
  fast: 150,
  base: 200,
  slow: 250,
  /** 抽屉滑入、批量条上浮这类位移较大的过渡 */
  drawer: 320,
  /** 图表首绘 */
  chart: 600,
  /** KPI 数字滚动 */
  countUp: 800,
} as const;

/** 与 tokens.css --ease 对齐 */
export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * 用户是否要求减弱动效。
 *
 * 每次调用都现查而不是缓存：系统设置可能在页面打开期间改变，缓存会让已挂载的
 * 组件一直沿用旧答案。
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
