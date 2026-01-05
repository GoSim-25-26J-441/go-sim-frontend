"use client";

import { TimeSeriesData } from "@/types/simulation";
import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { Download, Maximize2, Minimize2 } from "lucide-react";

interface MetricsChartProps {
  data: TimeSeriesData[];
  metrics: (keyof TimeSeriesData)[];
  labels: string[];
  colors: string[];
  yAxisLabel?: string;
  height?: number;
  showZoom?: boolean;
  showExport?: boolean;
}

// Custom tooltip component for better styling
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-white/60 text-sm mb-2">
          {new Date(label).toLocaleTimeString()}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}`}
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

export function MetricsChart({
  data,
  metrics,
  labels,
  colors,
  yAxisLabel,
  height = 300,
  showZoom = true,
  showExport = true,
}: MetricsChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartKey, setChartKey] = useState(0);

  // Inject custom styles for brush component
  useEffect(() => {
    const styleId = "recharts-brush-dark-theme";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .recharts-brush-traveller {
          fill: #ffffff40 !important;
          stroke: #ffffff60 !important;
        }
        .recharts-brush-slide {
          fill: #ffffff10 !important;
        }
        .recharts-brush-texts text {
          fill: #ffffff60 !important;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      // Don't remove on unmount as other charts might use it
    };
  }, []);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    return data.map((d) => {
      const item: any = {
        timestamp: new Date(d.timestamp).getTime(),
        timeLabel: new Date(d.timestamp).toLocaleTimeString(),
      };

      metrics.forEach((metric, index) => {
        item[labels[index] || metric] = Number(d[metric]) || 0;
      });

      return item;
    });
  }, [data, metrics, labels]);

  // Calculate domain for Y-axis
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    const allValues = chartData.flatMap((d) =>
      metrics.map((metric, index) => {
        const label = labels[index] || metric;
        return Number(d[label]) || 0;
      })
    );

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1 || 1;

    return [Math.max(0, min - padding), max + padding];
  }, [chartData, metrics, labels]);

  const handleExport = () => {
    // Create CSV content
    const headers = ["Timestamp", ...labels];
    const rows = chartData.map((d) => [
      new Date(d.timestamp).toISOString(),
      ...metrics.map((metric, index) => {
        const label = labels[index] || metric;
        return d[label] || 0;
      }),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Create blob and download
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
    setChartKey((prev) => prev + 1); // Force re-render
  };

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-white/60">
        No data available
      </div>
    );
  }

  const chartHeight = isFullscreen ? 600 : height;

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
            margin={{ top: 5, right: 20, left: 10, bottom: 60 }}
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
              stroke="#ffffff60"
              tick={{ fill: "#ffffff60", fontSize: 12 }}
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "#ffffff80",
                      style: { textAnchor: "middle" },
                    }
                  : undefined
              }
              domain={yAxisDomain}
            />
            <Tooltip content={<CustomTooltip />} />
            {showZoom && (
              <Brush
                dataKey="timestamp"
                height={30}
                stroke="#ffffff20"
                fill="#ffffff10"
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                travellerWidth={10}
              />
            )}

            {metrics.map((metric, index) => {
              const label = labels[index] || metric;
              return (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={label}
                  stroke={colors[index] || `#${Math.floor(Math.random() * 16777215).toString(16)}`}
                  strokeWidth={2}
                  dot={{ r: 2, fill: colors[index] }}
                  activeDot={{ r: 5 }}
                  name={label}
                />
              );
            })}
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

