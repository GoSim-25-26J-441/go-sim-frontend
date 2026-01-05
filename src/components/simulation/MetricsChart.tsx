"use client";

import { TimeSeriesData } from "@/types/simulation";
import { useMemo } from "react";

interface MetricsChartProps {
  data: TimeSeriesData[];
  metrics: (keyof TimeSeriesData)[];
  labels: string[];
  colors: string[];
  yAxisLabel: string;
}

export function MetricsChart({
  data,
  metrics,
  labels,
  colors,
  yAxisLabel,
}: MetricsChartProps) {
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const maxValue = Math.max(
      ...data.flatMap((d) => metrics.map((m) => Number(d[m]) || 0))
    );
    const minValue = Math.min(
      ...data.flatMap((d) => metrics.map((m) => Number(d[m]) || 0))
    );
    const range = maxValue - minValue || 1;
    const height = 200;
    const width = 100;
    const padding = 20;

    const points = metrics.map((metric, metricIndex) => {
      return data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * width;
        const value = Number(d[metric]) || 0;
        const normalized = (value - minValue) / range;
        const y = height - normalized * (height - padding * 2) - padding;
        return { x, y, value, timestamp: d.timestamp };
      });
    });

    return { points, maxValue, minValue, range, width, height };
  }, [data, metrics]);

  if (!chartData || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-white/60">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="relative" style={{ height: chartData.height }}>
        <svg
          width="100%"
          height={chartData.height}
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          className="overflow-visible"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartData.height - ratio * (chartData.height - 40) - 20;
            return (
              <g key={ratio}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartData.width}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-white/10"
                />
                <text
                  x={-5}
                  y={y + 3}
                  fill="currentColor"
                  fontSize="10"
                  className="text-white/40"
                  textAnchor="end"
                >
                  {(
                    chartData.minValue +
                    (1 - ratio) * chartData.range
                  ).toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Data lines */}
          {chartData.points.map((points, metricIndex) => {
            const path = points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ");

            return (
              <g key={metricIndex}>
                <path
                  d={path}
                  fill="none"
                  stroke={colors[metricIndex]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data points */}
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="2"
                    fill={colors[metricIndex]}
                    className="opacity-0 hover:opacity-100 transition-opacity"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        {labels.map((label, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="text-white/80">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

