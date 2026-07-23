import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { DURATION, prefersReducedMotion } from "../lib/motion";

/**
 * 后台图表的共用件。四张图原先各写各的 Tooltip 与配色，改版时容易漏掉一张；
 * 收到这里之后新增图表默认就是同一套观感。
 *
 * 颜色一律走 --chart-1..5：这些令牌在深色下会整体提亮并拉开相邻两色的明度差，
 * 组件里写死色值会让深色主题失效。
 */

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

/** shadcn 风格的 tooltip 卡片：不透底、跟随主题、数值等宽 */
export function ChartTooltip({ active, payload, label, unit = "" }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit?: string;
}): ReactNode {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && label !== "" ? <div className="chart-tooltip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div className="chart-tooltip-row" key={String(entry.dataKey ?? entry.name)}>
          <span className="chart-tooltip-dot" style={{ background: entry.color }} aria-hidden="true" />
          <span className="chart-tooltip-name">{entry.name}</span>
          <b>{Number(entry.value ?? 0).toLocaleString("zh-CN")}{unit}</b>
        </div>
      ))}
    </div>
  );
}

export interface AreaSeries {
  dataKey: string;
  name: string;
  /** --chart-N 的序号 */
  tone: 1 | 2 | 3 | 4 | 5;
}

/**
 * 带渐变面积的折线图。渐变用 <defs><linearGradient>，每个系列一个独立 id——
 * 同页多张图共用 id 会互相覆盖，所以 id 里带上 dataKey。
 */
export function GradientAreaChart({ data, series, xKey, height = 200, unit = "", showGrid = true }: {
  data: Array<Record<string, unknown>>;
  series: AreaSeries[];
  xKey: string;
  height?: number;
  unit?: string;
  showGrid?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <defs>
          {series.map((item) => (
            <linearGradient id={`area-${item.dataKey}`} key={item.dataKey} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--chart-${item.tone})`} stopOpacity={0.28} />
              <stop offset="100%" stopColor={`var(--chart-${item.tone})`} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /> : null}
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} stroke="var(--text-tertiary)" />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
        {series.map((item) => (
          <Area
            key={item.dataKey}
            type="monotone"
            dataKey={item.dataKey}
            name={item.name}
            stroke={`var(--chart-${item.tone})`}
            strokeWidth={2.5}
            fill={`url(#area-${item.dataKey})`}
            // 首绘 600ms，之后数据更新不再重播，避免轮询时图表一直动
            isAnimationActive={!prefersReducedMotion()}
            animationDuration={DURATION.chart}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
