"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Download,
  Activity,
  Clock,
  Zap,
} from "lucide-react";
import { SimulationRun } from "@/types/simulation";
import { getSimulationRun } from "@/lib/api-client/simulation";
import { SummaryStats } from "@/components/simulation/SummaryStats";
import { MetricsChart } from "@/components/simulation/MetricsChart";
import { MultiAxisChart } from "@/components/simulation/MultiAxisChart";
import { ResourceGraphViewer } from "@/components/simulation/ResourceGraphViewer";

export default function SimulationAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    getSimulationRun(id)
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load simulation:", err);
        setError("Failed to load simulation data");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60">Loading analysis...</div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">{error || "Simulation not found"}</p>
          <Link
            href="/simulator"
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Simulations
          </Link>
        </div>
      </div>
    );
  }

  if (!run.results) {
    return (
      <div className="p-6">
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-yellow-400">
            This simulation doesn't have results yet. Analysis is only available for completed runs.
          </p>
          <Link
            href={`/simulator/${id}`}
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Simulation Details
          </Link>
        </div>
      </div>
    );
  }

  const results = run.results;
  const summary = results.summary;

  // Calculate insights
  const insights = [
    {
      type: "success",
      title: "Performance",
      value: summary.avg_rps > 1000 ? "High Throughput" : "Moderate Throughput",
      description: `${summary.avg_rps.toLocaleString()} avg RPS`,
      icon: TrendingUp,
      color: "text-green-400",
    },
    {
      type: summary.avg_latency_ms < 100 ? "success" : summary.avg_latency_ms < 200 ? "warning" : "error",
      title: "Latency",
      value: summary.avg_latency_ms < 100 ? "Excellent" : summary.avg_latency_ms < 200 ? "Good" : "Needs Improvement",
      description: `${summary.avg_latency_ms.toFixed(1)}ms avg, ${summary.p95_latency_ms.toFixed(1)}ms p95`,
      icon: Clock,
      color: summary.avg_latency_ms < 100 ? "text-green-400" : summary.avg_latency_ms < 200 ? "text-yellow-400" : "text-red-400",
    },
    {
      type: (summary.successful_requests / summary.total_requests) > 0.99 ? "success" : "warning",
      title: "Reliability",
      value: `${((summary.successful_requests / summary.total_requests) * 100).toFixed(2)}%`,
      description: `${summary.failed_requests.toLocaleString()} failed requests`,
      icon: CheckCircle2,
      color: (summary.successful_requests / summary.total_requests) > 0.99 ? "text-green-400" : "text-yellow-400",
    },
    {
      type: "info",
      title: "Resource Efficiency",
      value: "Analyzed",
      description: `${run.config.nodes} nodes, ${run.config.resources.vcpu_per_node * run.config.nodes} total vCPU`,
      icon: Activity,
      color: "text-blue-400",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/simulator/${id}`}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Analysis Dashboard</h1>
            <p className="text-sm text-white/60 mt-1">{run.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/simulator/${id}`}
            className="px-4 py-2 text-white/80 hover:text-white transition-colors"
          >
            View Details
          </Link>
          <button
            onClick={() => {
              // Export analysis report
              const report = {
                simulation_id: run.id,
                name: run.name,
                status: run.status,
                summary: summary,
                timestamp: new Date().toISOString(),
              };
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `simulation-analysis-${run.id}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {insights.map((insight, index) => {
          const Icon = insight.icon;
          return (
            <div
              key={index}
              className="bg-card rounded-lg p-4 border border-border hover:border-white/20 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${insight.color}`} />
                <span className="text-xs text-white/60">{insight.title}</span>
              </div>
              <p className="text-xl font-bold text-white mb-1">{insight.value}</p>
              <p className="text-sm text-white/60">{insight.description}</p>
            </div>
          );
        })}
      </div>

      {/* Performance Analysis */}
      <div className="bg-card rounded-lg p-6 border border-border">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Performance Analysis
        </h2>
        <div className="space-y-6">
          {/* Summary Stats */}
          <SummaryStats results={results} />

          {/* Combined Performance Chart */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Performance Overview</h3>
            <MultiAxisChart
              data={results.time_series}
              metrics={[
                {
                  key: "rps",
                  label: "RPS",
                  color: "#8b5cf6",
                  yAxisId: "left",
                  unit: " req/s",
                },
                {
                  key: "latency_ms",
                  label: "Latency",
                  color: "#f59e0b",
                  yAxisId: "right",
                  unit: " ms",
                },
                {
                  key: "error_rate",
                  label: "Error Rate",
                  color: "#ef4444",
                  yAxisId: "right",
                  unit: " %",
                },
              ]}
              height={400}
              showZoom={true}
              showExport={true}
              leftAxisLabel="RPS"
              rightAxisLabel="Latency (ms) / Error Rate (%)"
            />
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Throughput & Latency</h3>
              <MetricsChart
                data={results.time_series}
                metrics={["rps", "latency_ms"]}
                labels={["RPS", "Latency (ms)"]}
                colors={["#8b5cf6", "#f59e0b"]}
                yAxisLabel="Value"
                height={300}
                showZoom={true}
                showExport={true}
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Load & Errors</h3>
              <MetricsChart
                data={results.time_series}
                metrics={["concurrent_users", "error_rate"]}
                labels={["Concurrent Users", "Error Rate"]}
                colors={["#06b6d4", "#ef4444"]}
                yAxisLabel="Value"
                height={300}
                showZoom={true}
                showExport={true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resource Analysis */}
      <div className="bg-card rounded-lg p-6 border border-border">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Resource Utilization
        </h2>
        <div className="space-y-6">
          <ResourceGraphViewer
            nodeMetrics={results.node_metrics}
            config={run.config}
          />
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-card rounded-lg p-6 border border-border">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Recommendations
        </h2>
        <div className="space-y-3">
          {summary.avg_latency_ms > 200 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">High Latency Detected</p>
                  <p className="text-sm text-white/80">
                    Average latency is {summary.avg_latency_ms.toFixed(1)}ms. Consider scaling up resources or
                    optimizing service performance.
                  </p>
                </div>
              </div>
            </div>
          )}
          {summary.failed_requests > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">Request Failures</p>
                  <p className="text-sm text-white/80">
                    {summary.failed_requests.toLocaleString()} requests failed. Investigate error patterns and
                    system stability.
                  </p>
                </div>
              </div>
            </div>
          )}
          {summary.avg_rps > 1000 && summary.avg_latency_ms < 100 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">Excellent Performance</p>
                  <p className="text-sm text-white/80">
                    System is handling high throughput ({summary.avg_rps.toLocaleString()} RPS) with low latency
                    ({summary.avg_latency_ms.toFixed(1)}ms). Current configuration appears optimal.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

