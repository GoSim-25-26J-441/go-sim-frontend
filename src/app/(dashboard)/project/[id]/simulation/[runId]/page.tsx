"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Square,
  Loader2,
  AlertCircle,
  Users,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { SimulationRun, TimeSeriesData, NodeMetrics } from "@/types/simulation";
import {
  getSimulationRun,
  stopSimulationRun,
  streamSimulationRunEvents,
  type MetricUpdatePayload,
  type MetricsSnapshotPayload,
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

export default function ProjectSimulationDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const runId = params.runId as string;
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveTimeSeries, setLiveTimeSeries] = useState<TimeSeriesData[]>([]);
  const [liveNodeMetrics, setLiveNodeMetrics] = useState<NodeMetrics[]>([]);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const tsBufferRef = useRef<Map<string, { cpuSum: number; cpuN: number; memSum: number; memN: number }>>(new Map());
  const nodeBufferRef = useRef<Map<string, { cpuSum: number; cpuN: number; memSum: number; memN: number }>>(new Map());

  useEffect(() => {
    if (!runId) {
      setLoading(false);
      return;
    }
    getSimulationRun(runId)
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load simulation run:", error);
        setLoading(false);
      });
  }, [runId]);

  useEffect(() => {
    if (!run || run.status !== "running" || run.id !== runId) {
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }
      return;
    }
    setLiveTimeSeries([]);
    setLiveNodeMetrics([]);
    tsBufferRef.current = new Map();
    nodeBufferRef.current = new Map();
    closeStreamRef.current = streamSimulationRunEvents(runId, {
      onEvent(ev) {
        const d = ev.data as Record<string, unknown> | undefined;
        if (ev.type === "initial" || ev.type === "update") {
          getSimulationRun(runId).then(setRun).catch(console.error);
          return;
        }
        if (ev.type === "error" && d) {
          const inner = (d.data ?? d) as Record<string, unknown>;
          const msg = String(inner?.error ?? d.error ?? "Stream error");
          console.error("[SimulationStream]", msg);
          return;
        }
        if (ev.type === "status_change" && d) {
          const inner = (d.data ?? d) as Record<string, unknown>;
          if (inner && "status" in inner) {
            let s = String(inner.status);
            if (s.includes("_")) s = s.replace("RUN_STATUS_", "").toLowerCase() as SimulationRun["status"];
            setRun((prev) => (prev ? { ...prev, status: s as SimulationRun["status"] } : prev));
          }
          return;
        }
        if (ev.type === "metrics_snapshot" && d) {
          const payload = (d as Record<string, unknown>).data ?? d;
          const snap = payload as MetricsSnapshotPayload;
          const m = snap.metrics;
          if (!m) return;
          setRun((prev) => {
            const baseResults = prev?.results ?? {
              summary: { total_requests: 0, successful_requests: 0, failed_requests: 0, avg_latency_ms: 0, p95_latency_ms: 0, p99_latency_ms: 0, avg_rps: 0, peak_rps: 0 },
              node_metrics: [],
              time_series: [],
              workload_metrics: { concurrent_users: { min: 0, max: 0, avg: 0 }, rps: { min: 0, max: 0, avg: 0 }, latency: { min_ms: 0, max_ms: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0 } },
            };
            if (!prev) return prev;
            return {
              ...prev,
              results: {
                ...baseResults,
                summary: {
                  total_requests: m.total_requests ?? baseResults.summary.total_requests ?? 0,
                  successful_requests: m.successful_requests ?? baseResults.summary.successful_requests ?? 0,
                  failed_requests: m.failed_requests ?? baseResults.summary.failed_requests ?? 0,
                  avg_latency_ms: m.latency_mean_ms ?? baseResults.summary.avg_latency_ms ?? 0,
                  p95_latency_ms: m.latency_p95_ms ?? baseResults.summary.p95_latency_ms ?? 0,
                  p99_latency_ms: m.latency_p99_ms ?? baseResults.summary.p99_latency_ms ?? 0,
                  avg_rps: m.throughput_rps ?? baseResults.summary.avg_rps ?? 0,
                  peak_rps: m.throughput_rps ?? baseResults.summary.peak_rps ?? 0,
                },
                node_metrics: baseResults.node_metrics,
                time_series: baseResults.time_series,
                workload_metrics: baseResults.workload_metrics,
              },
            };
          });
          return;
        }
        if (ev.type === "metric_update" && d) {
          const raw: MetricUpdatePayload = (d.data ?? d) as MetricUpdatePayload;
          const value = Number(raw.value ?? 0);
          const metric = String(raw.metric ?? "");
          const tsMs = raw.timestamp_unix_ms ?? (raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now());
          const tsKey = String(Math.floor(tsMs / 1000));
          const labels = raw.labels ?? {};
          const instanceId = [labels.instance, labels.service].filter(Boolean).join(":") || "default";
          const pct = Math.min(100, Math.max(0, value <= 1 ? value * 100 : value));
          const isCpu = /cpu/i.test(metric);
          const isMem = /memory|mem/i.test(metric);
          if (isCpu || isMem) {
            const tsMap = tsBufferRef.current;
            let row = tsMap.get(tsKey);
            if (!row) {
              row = { cpuSum: 0, cpuN: 0, memSum: 0, memN: 0 };
              tsMap.set(tsKey, row);
            }
            if (isCpu) {
              row.cpuSum += pct;
              row.cpuN += 1;
            }
            if (isMem) {
              row.memSum += pct;
              row.memN += 1;
            }
            const nodeMap = nodeBufferRef.current;
            let nodeRow = nodeMap.get(instanceId);
            if (!nodeRow) {
              nodeRow = { cpuSum: 0, cpuN: 0, memSum: 0, memN: 0 };
              nodeMap.set(instanceId, nodeRow);
            }
            if (isCpu) {
              nodeRow.cpuSum += pct;
              nodeRow.cpuN += 1;
            }
            if (isMem) {
              nodeRow.memSum += pct;
              nodeRow.memN += 1;
            }
            const sorted = Array.from(tsMap.entries())
              .sort(([a], [b]) => Number(a) - Number(b))
              .slice(-250);
            setLiveTimeSeries(
              sorted.map(([t, r]) => ({
                timestamp: new Date(Number(t) * 1000).toISOString(),
                cpu_util_pct: validateTimeSeriesPoint(r.cpuN ? r.cpuSum / r.cpuN : 0),
                mem_util_pct: validateTimeSeriesPoint(r.memN ? r.memSum / r.memN : 0),
                rps: 0,
                latency_ms: 0,
                concurrent_users: 0,
                error_rate: 0,
              }))
            );
            setLiveNodeMetrics(
              Array.from(nodeMap.entries()).map(([nodeId, r]) => ({
                node_id: nodeId,
                spec: { vcpu: 1, memory_gb: 1, label: nodeId },
                avg_cpu_util_pct: validateTimeSeriesPoint(r.cpuN ? r.cpuSum / r.cpuN : 0),
                avg_mem_util_pct: validateTimeSeriesPoint(r.memN ? r.memSum / r.memN : 0),
                peak_cpu_util_pct: validateTimeSeriesPoint(r.cpuN ? r.cpuSum / r.cpuN : 0),
                peak_mem_util_pct: validateTimeSeriesPoint(r.memN ? r.memSum / r.memN : 0),
                network_io_mbps: 0,
              }))
            );
          }
        }
      },
      onClose() {
        closeStreamRef.current = null;
        getSimulationRun(runId).then(setRun).catch(console.error);
      },
    });
    return () => {
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }
    };
  }, [runId, run?.id, run?.status]);

  if (!projectId || !runId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project or run not found.</p>
        <Link href="/dashboard" className="text-white hover:underline mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    );
  }

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
            href={`/project/${projectId}/simulation`}
            className="text-white hover:text-white/80 underline"
          >
            Back to simulation runs
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = run.status === "running";
  const hasResults = !!run.results;
  const timeSeriesForCharts =
    liveTimeSeries.length > 0 ? liveTimeSeries : (run.results?.time_series ?? []);
  const nodeMetricsForCharts =
    liveNodeMetrics.length > 0 ? liveNodeMetrics : (run.results?.node_metrics ?? []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/project/${projectId}/simulation`}
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
              View analysis
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
              Stop simulation
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-white/60 mb-1">Status</p>
          <p className="text-lg font-semibold text-white capitalize">{run.status}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-white/60 mb-1">Created</p>
          <p className="text-lg font-semibold text-white">{new Date(run.created_at).toLocaleString()}</p>
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

      <div className="bg-card rounded-lg p-4 border border-border">
        <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-white/60">Nodes:</span><span className="text-white ml-2 font-medium">{run.config.nodes}</span></div>
          <div><span className="text-white/60">vCPU per node:</span><span className="text-white ml-2 font-medium">{run.config.resources.vcpu_per_node}</span></div>
          <div><span className="text-white/60">Memory per node:</span><span className="text-white ml-2 font-medium">{run.config.resources.memory_gb_per_node} GB</span></div>
          <div><span className="text-white/60">Concurrent users:</span><span className="text-white ml-2 font-medium">{run.config.workload.concurrent_users.toLocaleString()}</span></div>
          <div><span className="text-white/60">Target RPS:</span><span className="text-white ml-2 font-medium">{run.config.workload.rps_target?.toLocaleString() || "N/A"}</span></div>
          <div><span className="text-white/60">Duration:</span><span className="text-white ml-2 font-medium">{run.config.workload.duration_seconds}s</span></div>
          <div><span className="text-white/60">Ramp up:</span><span className="text-white ml-2 font-medium">{run.config.workload.ramp_up_seconds || 0}s</span></div>
          <div><span className="text-white/60">Scenario:</span><span className="text-white ml-2 font-medium capitalize">{run.config.scenario || "default"}</span></div>
        </div>
      </div>

      {run.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-400 mb-1">Simulation failed</p>
              <p className="text-sm text-red-300">{run.error}</p>
            </div>
          </div>
        </div>
      )}

      {isRunning && (
        <DynamicConfigControl
          run={run}
          onUpdate={() => getSimulationRun(runId).then(setRun).catch(console.error)}
        />
      )}

      {(hasResults || timeSeriesForCharts.length > 0) && (
        <>
          {run.results && <SummaryStats results={run.results} />}
          <div className="relative">
            <ResourceGraph timeSeriesData={timeSeriesForCharts} nodeMetrics={nodeMetricsForCharts} />
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance overview (multi-axis)
            </h3>
            <MultiAxisChart
              data={timeSeriesForCharts}
              metrics={[{ key: "rps", label: "RPS", color: "#8b5cf6", yAxisId: "left", unit: " req/s" }, { key: "latency_ms", label: "Latency", color: "#f59e0b", yAxisId: "right", unit: " ms" }]}
              height={350}
              showZoom={true}
              showExport={true}
              leftAxisLabel="RPS"
              rightAxisLabel="Latency (ms)"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-4 border border-border">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5" />Performance metrics</h3>
              <MetricsChart data={timeSeriesForCharts} metrics={["rps", "latency_ms"]} labels={["RPS", "Latency (ms)"]} colors={["#8b5cf6", "#f59e0b"]} yAxisLabel="Value" height={300} showZoom={true} showExport={true} />
            </div>
            <div className="bg-card rounded-lg p-4 border border-border">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5" />Load metrics</h3>
              <MetricsChart data={timeSeriesForCharts} metrics={["concurrent_users", "error_rate"]} labels={["Concurrent Users", "Error Rate"]} colors={["#06b6d4", "#ef4444"]} yAxisLabel="Value" height={300} showZoom={true} showExport={true} />
            </div>
          </div>
          {nodeMetricsForCharts.length > 0 && (
            <div>
              <ResourceGraphViewer nodeMetrics={nodeMetricsForCharts} config={run.config} />
            </div>
          )}
          {nodeMetricsForCharts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Node metrics</h2>
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
            {isRunning ? "Simulation is running. Results will appear here when available." : "No results available yet."}
          </p>
        </div>
      )}
    </div>
  );
}
