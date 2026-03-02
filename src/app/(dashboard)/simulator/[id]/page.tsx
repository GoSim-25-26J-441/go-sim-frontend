"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Square,
  Loader2,
  AlertCircle,
  Cpu,
  MemoryStick,
  Network,
  Users,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { SimulationRun, TimeSeriesData } from "@/types/simulation";
import {
  getSimulationRun,
  stopSimulationRun,
  streamSimulationRunEvents,
} from "@/lib/api-client/simulation";
import { MetricsChart } from "@/components/simulation/MetricsChart";
import { MultiAxisChart } from "@/components/simulation/MultiAxisChart";
import { NodeMetricsCard } from "@/components/simulation/NodeMetricsCard";
import { SummaryStats } from "@/components/simulation/SummaryStats";
import { ResourceGraph } from "@/components/simulation/ResourceGraph";
import { ResourceGraphViewer } from "@/components/simulation/ResourceGraphViewer";
import { DynamicConfigControl } from "@/components/simulation/DynamicConfigControl";

function validateTimeSeriesPoint(v: number): number {
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

export default function SimulationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveTimeSeries, setLiveTimeSeries] = useState<TimeSeriesData[]>([]);
  const closeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getSimulationRun(id)
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load simulation run:", error);
        setLoading(false);
      });
  }, [id]);

  // Subscribe to SSE events when run is running
  useEffect(() => {
    if (!run || run.status !== "running" || run.id !== id) {
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }
      return;
    }
    setLiveTimeSeries([]);
    closeStreamRef.current = streamSimulationRunEvents(id, {
      onEvent(ev) {
        const d = ev.data as Record<string, unknown> | undefined;
        if (ev.type === "update") {
          getSimulationRun(id).then(setRun).catch(console.error);
          return;
        }
        if (ev.type === "status_change" && d && "status" in d) {
          setRun((prev) =>
            prev ? { ...prev, status: String(d.status) as SimulationRun["status"] } : prev
          );
          return;
        }
        if (ev.type === "metric_update" && d) {
          const data = d.data ?? d;
          const raw = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
          const value = Number(raw.value ?? 0);
          const ts = (raw.timestamp as string) ?? new Date().toISOString();
          const metric = String(raw.metric ?? "");
          const labels = (raw.labels as Record<string, string>) ?? {};
          setLiveTimeSeries((prev) => {
            const last = prev[prev.length - 1];
            const base = last
              ? { ...last, timestamp: ts }
              : {
                  timestamp: ts,
                  cpu_util_pct: 0,
                  mem_util_pct: 0,
                  rps: 0,
                  latency_ms: 0,
                  concurrent_users: 0,
                  error_rate: 0,
                };
            const pct = Math.min(100, Math.max(0, metric.includes("memory") ? value * 100 : value * 100));
            if (metric.includes("cpu")) base.cpu_util_pct = validateTimeSeriesPoint(pct);
            else if (metric.includes("memory") || metric.includes("mem")) base.mem_util_pct = validateTimeSeriesPoint(pct);
            return [...prev.slice(-199), base];
          });
        }
      },
      onClose() {
        closeStreamRef.current = null;
        getSimulationRun(id).then(setRun).catch(console.error);
      },
    });
    return () => {
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }
    };
  }, [id, run?.id, run?.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-white/60 mb-4">Simulation run not found</p>
          <Link
            href="/simulator"
            className="text-white hover:text-white/80 underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = run.status === "running";
  const hasResults = !!run.results;
  const timeSeriesForCharts =
    liveTimeSeries.length > 0 ? liveTimeSeries : (run.results?.time_series ?? []);
  const nodeMetricsForCharts = run.results?.node_metrics ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/simulator"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{run.name}</h1>
            <p className="text-sm text-white/60 mt-1">
              {run.config.description || "Simulation run details"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {run.status === "completed" && run.results && (
            <Link
              href="/cost"
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              View Analysis
            </Link>
          )}
          {isRunning && (
            <button
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              onClick={async () => {
                if (!run) return;
                try {
                  const updated = await stopSimulationRun(run.id);
                  setRun(updated);
                } catch (error) {
                  console.error("Failed to stop simulation:", error);
                }
              }}
            >
              <Square className="w-4 h-4" />
              Stop Simulation
            </button>
          )}
        </div>
      </div>

      {/* Status and Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-white/60 mb-1">Status</p>
          <p className="text-lg font-semibold text-white capitalize">{run.status}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-white/60 mb-1">Created</p>
          <p className="text-lg font-semibold text-white">
            {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-white/60 mb-1">Duration</p>
          <p className="text-lg font-semibold text-white">
            {run.duration_seconds
              ? `${Math.floor(run.duration_seconds / 60)}m ${run.duration_seconds % 60}s`
              : "-"}
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-white/60">Nodes:</span>
            <span className="text-white ml-2 font-medium">{run.config.nodes}</span>
          </div>
          <div>
            <span className="text-white/60">vCPU per Node:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.resources.vcpu_per_node}
            </span>
          </div>
          <div>
            <span className="text-white/60">Memory per Node:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.resources.memory_gb_per_node} GB
            </span>
          </div>
          <div>
            <span className="text-white/60">Concurrent Users:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.workload.concurrent_users.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-white/60">Target RPS:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.workload.rps_target?.toLocaleString() || "N/A"}
            </span>
          </div>
          <div>
            <span className="text-white/60">Duration:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.workload.duration_seconds}s
            </span>
          </div>
          <div>
            <span className="text-white/60">Ramp Up:</span>
            <span className="text-white ml-2 font-medium">
              {run.config.workload.ramp_up_seconds || 0}s
            </span>
          </div>
          <div>
            <span className="text-white/60">Scenario:</span>
            <span className="text-white ml-2 font-medium capitalize">
              {run.config.scenario || "default"}
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {run.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-400 mb-1">Simulation Failed</p>
              <p className="text-sm text-red-300">{run.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Configuration Control (only for running simulations) */}
      {isRunning && (
        <DynamicConfigControl
          run={run}
          onUpdate={() => {
            // Optionally refresh the run data after update
            getSimulationRun(id).then(setRun).catch(console.error);
          }}
        />
      )}

      {/* Results (from run.results or live stream) */}
      {(hasResults || timeSeriesForCharts.length > 0) && (
        <>
          {run.results && (
            <SummaryStats results={run.results} />
          )}

          {/* Resource Graph */}
          <div className="relative">
            <ResourceGraph
              timeSeriesData={timeSeriesForCharts}
              nodeMetrics={nodeMetricsForCharts}
            />
          </div>

          {/* Combined Performance Chart (Multi-Axis) */}
          <div className="bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Overview (Multi-Axis)
            </h3>
            <MultiAxisChart
              data={timeSeriesForCharts}
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
              ]}
              height={350}
              showZoom={true}
              showExport={true}
              leftAxisLabel="RPS"
              rightAxisLabel="Latency (ms)"
            />
          </div>

          {/* Time Series Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-4 border border-border">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Performance Metrics
              </h3>
              <MetricsChart
                data={timeSeriesForCharts}
                metrics={["rps", "latency_ms"]}
                labels={["RPS", "Latency (ms)"]}
                colors={["#8b5cf6", "#f59e0b"]}
                yAxisLabel="Value"
                height={300}
                showZoom={true}
                showExport={true}
              />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Load Metrics
              </h3>
              <MetricsChart
                data={timeSeriesForCharts}
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

          {/* Resource Topology Graph */}
          {nodeMetricsForCharts.length > 0 && (
            <div>
              <ResourceGraphViewer
                nodeMetrics={nodeMetricsForCharts}
                config={run.config}
              />
            </div>
          )}

          {nodeMetricsForCharts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Node Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nodeMetricsForCharts.map((node) => (
                  <NodeMetricsCard key={node.node_id} node={node} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!hasResults && run.status !== "failed" && (
        <div className="bg-card rounded-lg p-8 border border-border text-center">
          <p className="text-white/60">
            {isRunning
              ? "Simulation is running. Results will appear here when available."
              : "No results available yet."}
          </p>
        </div>
      )}
    </div>
  );
}

