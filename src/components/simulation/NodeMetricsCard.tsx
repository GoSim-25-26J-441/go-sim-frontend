"use client";

import { NodeMetrics } from "@/types/simulation";
import { Cpu, MemoryStick, Network } from "lucide-react";

interface NodeMetricsCardProps {
  node: NodeMetrics;
}

export function NodeMetricsCard({ node }: NodeMetricsCardProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-border hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white">{node.spec.label}</h3>
        <div className="text-xs text-white/60">
          {node.spec.vcpu}vCPU / {node.spec.memory_gb}GB
        </div>
      </div>

      <div className="space-y-3">
        {/* CPU Utilization */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-white/80">CPU</span>
            </div>
            <span className="text-sm font-medium text-white">
              {node.avg_cpu_util_pct.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-blue-400 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, node.avg_cpu_util_pct)}%` }}
            />
          </div>
          <div className="text-xs text-white/60 mt-1">
            Peak: {node.peak_cpu_util_pct.toFixed(1)}%
          </div>
        </div>

        {/* Memory Utilization */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MemoryStick className="w-4 h-4 text-green-400" />
              <span className="text-sm text-white/80">Memory</span>
            </div>
            <span className="text-sm font-medium text-white">
              {node.avg_mem_util_pct.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-green-400 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, node.avg_mem_util_pct)}%` }}
            />
          </div>
          <div className="text-xs text-white/60 mt-1">
            Peak: {node.peak_mem_util_pct.toFixed(1)}%
          </div>
        </div>

        {/* Network I/O */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-white/80">Network I/O</span>
            </div>
            <span className="text-sm font-medium text-white">
              {node.network_io_mbps.toFixed(1)} Mbps
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

