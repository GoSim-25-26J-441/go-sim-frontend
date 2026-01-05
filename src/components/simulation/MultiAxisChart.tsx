"use client";

import { TimeSeriesData } from "@/types/simulation";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { Download, Maximize2, Minimize2 } from "lucide-react";

interface MetricConfig {
  key: keyof TimeSeriesData;
  label: string;
  color: string;
  yAxisId?: "left" | "right";
  unit?: string;
}

interface MultiAxisChartProps {
  data: TimeSeriesData[];
  metrics: MetricConfig[];
  height?: number;
  showZoom?: boolean;
  showExport?: boolean;
  leftAxisLabel?: string;
  rightAxisLabel?: string;
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-white/60 text-sm mb-2">
          {new Date(label).toLocaleTimeString()}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}${entry.payload.unit || ""}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Custom legend component
const CustomLegend = ({ payload }: any) => {
  return (
    <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
      {payload?.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-white/80">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function MultiAxisChart({
  data,
  metrics,
  height = 300,
  showZoom = true,
  showExport = true,
  leftAxisLabel,
  rightAxisLabel,
}: MultiAxisChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartKey, setChartKey] = useState(0);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    return data.map((d) => {
      const item: any = {
        timestamp: new Date(d.timestamp).getTime(),
        timeLabel: new Date(d.timestamp).toLocaleTimeString(),
      };

      metrics.forEach((metric) => {
        item[metric.label] = Number(d[metric.key]) || 0;
        item[`${metric.label}_unit`] = metric.unit || "";
      });

      return item;
    });
  }, [data, metrics]);

  // Calculate domains for Y-axes
  const { leftDomain, rightDomain } = useMemo(() => {
    if (chartData.length === 0) {
      return { leftDomain: [0, 100], rightDomain: [0, 100] };
    }

    const leftMetrics = metrics.filter((m) => !m.yAxisId || m.yAxisId === "left");
    const rightMetrics = metrics.filter((m) => m.yAxisId === "right");

    const leftValues = chartData.flatMap((d) =>
      leftMetrics.map((m) => Number(d[m.label]) || 0)
    );
    const rightValues = chartData.flatMap((d) =>
      rightMetrics.map((m) => Number(d[m.label]) || 0)
    );

    const calculateDomain = (values: number[]) => {
      if (values.length === 0) return [0, 100];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = (max - min) * 0.1 || 1;
      return [Math.max(0, min - padding), max + padding];
    };

    return {
      leftDomain: calculateDomain(leftValues),
      rightDomain: rightValues.length > 0 ? calculateDomain(rightValues) : undefined,
    };
  }, [chartData, metrics]);

  const handleExport = () => {
    const headers = ["Timestamp", ...metrics.map((m) => m.label)];
    const rows = chartData.map((d) => [
      new Date(d.timestamp).toISOString(),
      ...metrics.map((m) => d[m.label] || 0),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrics-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setChartKey((prev) => prev + 1);
  };

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-white/60">
        No data available
      </div>
    );
  }

  const chartHeight = isFullscreen ? 600 : height;
  const hasRightAxis = metrics.some((m) => m.yAxisId === "right");

  return (
    <div className="space-y-4">
      {/* Chart Header with Actions */}
      {(showExport || showZoom) && (
        <div className="flex items-center justify-end gap-2">
          {showExport && (
            <button
              onClick={handleExport}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              title="Export as CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {showZoom && (
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              title={isFullscreen ? "Minimize" : "Maximize"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Chart */}
      <div
        className={`${isFullscreen ? "fixed inset-4 z-50 bg-gray-900 rounded-lg p-6 border border-gray-700" : "relative"}`}
        style={{ height: chartHeight }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={chartKey}
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis
              dataKey="timestamp"
              stroke="#ffffff60"
              tick={{ fill: "#ffffff60", fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              yAxisId="left"
              stroke="#ffffff60"
              tick={{ fill: "#ffffff60", fontSize: 12 }}
              label={
                leftAxisLabel
                  ? {
                      value: leftAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "#ffffff80",
                      style: { textAnchor: "middle" },
                    }
                  : undefined
              }
              domain={leftDomain}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#ffffff60"
                tick={{ fill: "#ffffff60", fontSize: 12 }}
                label={
                  rightAxisLabel
                    ? {
                        value: rightAxisLabel,
                        angle: 90,
                        position: "insideRight",
                        fill: "#ffffff80",
                        style: { textAnchor: "middle" },
                      }
                    : undefined
                }
                domain={rightDomain}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {showZoom && (
              <Brush
                dataKey="timestamp"
                height={30}
                stroke="#3b82f6"
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              />
            )}

            {metrics.map((metric) => (
              <Line
                key={metric.key}
                yAxisId={metric.yAxisId || "left"}
                type="monotone"
                dataKey={metric.label}
                stroke={metric.color}
                strokeWidth={2}
                dot={{ r: 2, fill: metric.color }}
                activeDot={{ r: 5 }}
                name={metric.label}
              />
            ))}
            <Legend content={<CustomLegend />} />
          </LineChart>
        </ResponsiveContainer>

        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-white"
            title="Close"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

