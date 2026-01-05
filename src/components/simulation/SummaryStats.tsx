"use client";

import { SimulationResults } from "@/types/simulation";
import { Activity, Clock, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

interface SummaryStatsProps {
  results: SimulationResults;
}

export function SummaryStats({ results }: SummaryStatsProps) {
  const { summary } = results;
  const successRate = ((summary.successful_requests / summary.total_requests) * 100).toFixed(2);

  const stats = [
    {
      label: "Total Requests",
      value: summary.total_requests.toLocaleString(),
      icon: Activity,
      color: "text-blue-400",
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      icon: CheckCircle2,
      color: "text-green-400",
    },
    {
      label: "Failed Requests",
      value: summary.failed_requests.toLocaleString(),
      icon: XCircle,
      color: "text-red-400",
    },
    {
      label: "Avg RPS",
      value: summary.avg_rps.toLocaleString(),
      icon: TrendingUp,
      color: "text-purple-400",
    },
    {
      label: "Peak RPS",
      value: summary.peak_rps.toLocaleString(),
      icon: TrendingUp,
      color: "text-orange-400",
    },
    {
      label: "Avg Latency",
      value: `${summary.avg_latency_ms.toFixed(1)}ms`,
      icon: Clock,
      color: "text-yellow-400",
    },
    {
      label: "P95 Latency",
      value: `${summary.p95_latency_ms.toFixed(1)}ms`,
      icon: Clock,
      color: "text-amber-400",
    },
    {
      label: "P99 Latency",
      value: `${summary.p99_latency_ms.toFixed(1)}ms`,
      icon: Clock,
      color: "text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="bg-card rounded-lg p-4 border border-border hover:border-white/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <Icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-white/60 mt-1">{stat.label}</p>
          </div>
        );
      })}
    </div>
  );
}

