"use client";

import { TimeSeriesData, NodeMetrics } from "@/types/simulation";
import { useMemo, useState } from "react";
import { Cpu, MemoryStick, Network, Activity } from "lucide-react";

interface ResourceGraphProps {
  timeSeriesData: TimeSeriesData[];
  nodeMetrics?: NodeMetrics[];
}

export function ResourceGraph({
  timeSeriesData,
  nodeMetrics = [],
}: ResourceGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (timeSeriesData.length === 0) return null;

    const cpuData = timeSeriesData.map((d) => d.cpu_util_pct);
    const memData = timeSeriesData.map((d) => d.mem_util_pct);
    
    // Calculate average network I/O if node metrics are available
    const networkData = nodeMetrics.length > 0
      ? timeSeriesData.map((_, index) => {
          // For dummy data, we'll approximate network I/O based on CPU/RPS correlation
          const cpu = cpuData[index];
          const rps = timeSeriesData[index].rps;
          // Estimate network I/O as a function of RPS and CPU usage
          return Math.min(100, (rps * 0.05 + cpu * 0.3));
        })
      : timeSeriesData.map((d) => 0);

    const maxValue = Math.max(
      ...cpuData,
      ...memData,
      ...networkData,
      100
    );

    const height = 300;
    const width = timeSeriesData.length > 1 ? timeSeriesData.length * 2 : 800;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };

    // Calculate averages
    const avgCpu = cpuData.reduce((a, b) => a + b, 0) / cpuData.length;
    const avgMem = memData.reduce((a, b) => a + b, 0) / memData.length;
    const avgNetwork = networkData.reduce((a, b) => a + b, 0) / networkData.length;

    const points = {
      cpu: cpuData.map((value, i) => {
        const x = padding.left + (i / (timeSeriesData.length - 1 || 1)) * (width - padding.left - padding.right);
        const y = padding.top + (height - padding.top - padding.bottom) * (1 - value / maxValue);
        return { x, y, value };
      }),
      memory: memData.map((value, i) => {
        const x = padding.left + (i / (timeSeriesData.length - 1 || 1)) * (width - padding.left - padding.right);
        const y = padding.top + (height - padding.top - padding.bottom) * (1 - value / maxValue);
        return { x, y, value };
      }),
      network: networkData.map((value, i) => {
        const x = padding.left + (i / (timeSeriesData.length - 1 || 1)) * (width - padding.left - padding.right);
        const y = padding.top + (height - padding.top - padding.bottom) * (1 - value / maxValue);
        return { x, y, value };
      }),
    };

    return {
      points,
      maxValue,
      width,
      height,
      padding,
      averages: { cpu: avgCpu, memory: avgMem, network: avgNetwork },
    };
  }, [timeSeriesData, nodeMetrics]);

  if (!chartData || timeSeriesData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-white/60 bg-card rounded-lg border border-border">
        No resource data available
      </div>
    );
  }

  const hoveredData = hoveredIndex !== null ? timeSeriesData[hoveredIndex] : null;

  return (
    <div className="bg-card rounded-lg p-6 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Resource Utilization Graph
        </h3>
        
        {/* Average Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-white/60">CPU:</span>
            <span className="text-white font-medium">{chartData.averages.cpu.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-white/60">Memory:</span>
            <span className="text-white font-medium">{chartData.averages.memory.toFixed(1)}%</span>
          </div>
          {nodeMetrics.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-white/60">Network:</span>
              <span className="text-white font-medium">{chartData.averages.network.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative" style={{ height: chartData.height }}>
        <svg
          width="100%"
          height={chartData.height}
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          className="overflow-visible"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartData.padding.top + ratio * (chartData.height - chartData.padding.top - chartData.padding.bottom);
            const value = chartData.maxValue * (1 - ratio);
            return (
              <g key={ratio}>
                <line
                  x1={chartData.padding.left}
                  y1={y}
                  x2={chartData.width - chartData.padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-white/10"
                />
                <text
                  x={chartData.padding.left - 10}
                  y={y + 3}
                  fill="currentColor"
                  fontSize="11"
                  className="text-white/50"
                  textAnchor="end"
                >
                  {value.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* X-axis time labels */}
          {timeSeriesData.length > 0 && timeSeriesData.length <= 20 && timeSeriesData.map((d, i) => {
            if (i % Math.ceil(timeSeriesData.length / 6) !== 0 && i !== timeSeriesData.length - 1) return null;
            const x = chartData.padding.left + (i / (timeSeriesData.length - 1 || 1)) * (chartData.width - chartData.padding.left - chartData.padding.right);
            const timestamp = new Date(d.timestamp);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={chartData.height - chartData.padding.bottom}
                  x2={x}
                  y2={chartData.height - chartData.padding.bottom + 5}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-white/30"
                />
                <text
                  x={x}
                  y={chartData.height - chartData.padding.bottom + 18}
                  fill="currentColor"
                  fontSize="10"
                  className="text-white/50"
                  textAnchor="middle"
                >
                  {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </text>
              </g>
            );
          })}

          {/* Area fills for better visibility */}
          <defs>
            <linearGradient id="cpuGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="memGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            {nodeMetrics.length > 0 && (
              <linearGradient id="networkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
            )}
          </defs>

          {/* CPU Area */}
          <path
            d={`M ${chartData.points.cpu[0].x} ${chartData.height - chartData.padding.bottom} 
                ${chartData.points.cpu.map((p) => `L ${p.x} ${p.y}`).join(' ')} 
                L ${chartData.points.cpu[chartData.points.cpu.length - 1].x} ${chartData.height - chartData.padding.bottom} Z`}
            fill="url(#cpuGradient)"
          />

          {/* Memory Area */}
          <path
            d={`M ${chartData.points.memory[0].x} ${chartData.height - chartData.padding.bottom} 
                ${chartData.points.memory.map((p) => `L ${p.x} ${p.y}`).join(' ')} 
                L ${chartData.points.memory[chartData.points.memory.length - 1].x} ${chartData.height - chartData.padding.bottom} Z`}
            fill="url(#memGradient)"
          />

          {/* Network Area */}
          {nodeMetrics.length > 0 && (
            <path
              d={`M ${chartData.points.network[0].x} ${chartData.height - chartData.padding.bottom} 
                  ${chartData.points.network.map((p) => `L ${p.x} ${p.y}`).join(' ')} 
                  L ${chartData.points.network[chartData.points.network.length - 1].x} ${chartData.height - chartData.padding.bottom} Z`}
              fill="url(#networkGradient)"
            />
          )}

          {/* Data lines */}
          <path
            d={chartData.points.cpu.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={chartData.points.memory.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {nodeMetrics.length > 0 && (
            <path
              d={chartData.points.network.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover indicator line */}
          {hoveredIndex !== null && (
            <g>
              <line
                x1={chartData.points.cpu[hoveredIndex].x}
                y1={chartData.padding.top}
                x2={chartData.points.cpu[hoveredIndex].x}
                y2={chartData.height - chartData.padding.bottom}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 4"
                className="text-white/30"
              />
              {/* Hover points */}
              <circle
                cx={chartData.points.cpu[hoveredIndex].x}
                cy={chartData.points.cpu[hoveredIndex].y}
                r="5"
                fill="#3b82f6"
                stroke="white"
                strokeWidth="2"
              />
              <circle
                cx={chartData.points.memory[hoveredIndex].x}
                cy={chartData.points.memory[hoveredIndex].y}
                r="5"
                fill="#10b981"
                stroke="white"
                strokeWidth="2"
              />
              {nodeMetrics.length > 0 && (
                <circle
                  cx={chartData.points.network[hoveredIndex].x}
                  cy={chartData.points.network[hoveredIndex].y}
                  r="5"
                  fill="#8b5cf6"
                  stroke="white"
                  strokeWidth="2"
                />
              )}
            </g>
          )}

          {/* Invisible hover zones */}
          {chartData.points.cpu.map((_, i) => {
            if (i === chartData.points.cpu.length - 1) return null;
            const x1 = chartData.points.cpu[i].x;
            const x2 = chartData.points.cpu[i + 1].x;
            const midX = (x1 + x2) / 2;
            return (
              <rect
                key={i}
                x={midX - (x2 - x1) / 2}
                y={chartData.padding.top}
                width={x2 - x1}
                height={chartData.height - chartData.padding.top - chartData.padding.bottom}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                className="cursor-crosshair"
              />
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-white/80">CPU Utilization</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MemoryStick className="w-4 h-4 text-green-400" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-white/80">Memory Utilization</span>
          </div>
        </div>
        {nodeMetrics.length > 0 && (
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-purple-400" />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-sm text-white/80">Network I/O</span>
            </div>
          </div>
        )}
      </div>

      {/* Hover Tooltip */}
      {hoveredData && hoveredIndex !== null && chartData.points.cpu[hoveredIndex] && (
        <div
          className="absolute bg-gray-900 border border-white/20 rounded-lg p-3 shadow-xl pointer-events-none z-10"
          style={{
            left: `${(chartData.points.cpu[hoveredIndex].x / chartData.width) * 100}%`,
            top: `${(chartData.points.cpu[hoveredIndex].y / chartData.height) * 100 - 120}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-xs text-white/60 mb-2">
            {new Date(hoveredData.timestamp).toLocaleString()}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/80">CPU:</span>
              <span className="text-blue-400 font-medium">{hoveredData.cpu_util_pct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/80">Memory:</span>
              <span className="text-green-400 font-medium">{hoveredData.mem_util_pct.toFixed(1)}%</span>
            </div>
            {nodeMetrics.length > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/80">Network:</span>
                <span className="text-purple-400 font-medium">
                  {chartData.points.network[hoveredIndex].value.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

