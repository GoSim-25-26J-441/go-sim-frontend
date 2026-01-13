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
  Wifi,
} from "lucide-react";
import { SimulationRun, TimeSeriesData, NodeMetrics } from "@/types/simulation";
import { getSimulationRun, stopSimulationRun } from "@/lib/api-client/simulation";
import { SimulationStream, createSimulationStream } from "@/lib/api-client/simulation-stream";
import { MetricsChart } from "@/components/simulation/MetricsChart";
import { MultiAxisChart } from "@/components/simulation/MultiAxisChart";
import { NodeMetricsCard } from "@/components/simulation/NodeMetricsCard";
import { SummaryStats } from "@/components/simulation/SummaryStats";
import { ResourceGraph } from "@/components/simulation/ResourceGraph";
import { ResourceGraphViewer } from "@/components/simulation/ResourceGraphViewer";
import { DynamicConfigControl } from "@/components/simulation/DynamicConfigControl";

// Helper function to validate and sanitize time series data
function validateTimeSeriesData(ts: any): TimeSeriesData {
  return {
    timestamp: ts.timestamp || new Date().toISOString(),
    cpu_util_pct: (typeof ts.cpu_util_pct === 'number' && isFinite(ts.cpu_util_pct)) 
      ? Math.max(0, Math.min(100, ts.cpu_util_pct)) 
      : 0,
    mem_util_pct: (typeof ts.mem_util_pct === 'number' && isFinite(ts.mem_util_pct))
      ? Math.max(0, Math.min(100, ts.mem_util_pct))
      : 0,
    rps: (typeof ts.rps === 'number' && isFinite(ts.rps))
      ? Math.max(0, ts.rps)
      : 0,
    latency_ms: (typeof ts.latency_ms === 'number' && isFinite(ts.latency_ms))
      ? Math.max(0, ts.latency_ms)
      : 0,
    concurrent_users: (typeof ts.concurrent_users === 'number' && isFinite(ts.concurrent_users))
      ? Math.max(0, ts.concurrent_users)
      : 0,
    error_rate: (typeof ts.error_rate === 'number' && isFinite(ts.error_rate))
      ? Math.max(0, Math.min(100, ts.error_rate))
      : 0,
  };
}

interface DebugEvent {
  id: string;
  timestamp: string;
  type: string;
  rawData: any;
  parsedData?: any;
  eventType?: string;
}

export default function SimulationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const streamRef = useRef<SimulationStream | null>(null);
  const debugPanelRef = useRef<HTMLDivElement>(null);

  // Fetch initial simulation run data
  useEffect(() => {
    getSimulationRun(id)
      .then((data) => {
        if (data) {
          setRun(data);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load simulation run:", error);
        setLoading(false);
      });
  }, [id]);

  // Set up real-time streaming for running simulations
  useEffect(() => {
    if (!run || run.status !== "running") {
      // Clean up stream if simulation is not running
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
        setIsStreaming(false);
      }
      return;
    }

    // Only start streaming if we don't already have a stream
    if (streamRef.current) {
      return;
    }

    // Add debug event helper
    const addDebugEvent = (type: string, rawData: any, parsedData?: any, eventType?: string) => {
      const debugEvent: DebugEvent = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        type,
        rawData,
        parsedData,
        eventType,
      };
      setDebugEvents((prev) => [...prev.slice(-49), debugEvent]); // Keep last 50 events
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (debugPanelRef.current) {
          debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
        }
      }, 100);
    };

    // Create and start the stream
    const stream = createSimulationStream({
      runId: id,
      onRawEvent: (eventType: string, rawData: string, parsedData?: any) => {
        addDebugEvent(`sse_${eventType}`, rawData, parsedData, `SSE Event: ${eventType}`);
      },
      onMetricsUpdate: (event) => {
        console.log("[SimulationDetail] Received metrics update:", event);
        addDebugEvent("metrics_update", event, event.data, "onMetricsUpdate");
        setRun((currentRun) => {
          if (!currentRun) {
            // If no current run, we can't update - this shouldn't happen
            return currentRun;
          }

          if (!currentRun.results) {
            // Initialize results if they don't exist
            const eventSummary = event.data.summary || {};
            return {
              ...currentRun,
              results: {
                summary: {
                  total_requests: eventSummary.total_requests ?? 0,
                  successful_requests: eventSummary.successful_requests ?? 0,
                  failed_requests: eventSummary.failed_requests ?? 0,
                  avg_latency_ms: eventSummary.avg_latency_ms ?? 0,
                  p95_latency_ms: eventSummary.p95_latency_ms ?? 0,
                  p99_latency_ms: eventSummary.p99_latency_ms ?? 0,
                  avg_rps: eventSummary.avg_rps ?? 0,
                  peak_rps: eventSummary.peak_rps ?? 0,
                },
                node_metrics: (event.data.node_metrics || []).map((nm: any) => ({
                  ...nm,
                  avg_cpu_util_pct: (typeof nm.avg_cpu_util_pct === 'number' && isFinite(nm.avg_cpu_util_pct))
                    ? Math.max(0, Math.min(100, nm.avg_cpu_util_pct))
                    : 0,
                  avg_mem_util_pct: (typeof nm.avg_mem_util_pct === 'number' && isFinite(nm.avg_mem_util_pct))
                    ? Math.max(0, Math.min(100, nm.avg_mem_util_pct))
                    : 0,
                  peak_cpu_util_pct: (typeof nm.peak_cpu_util_pct === 'number' && isFinite(nm.peak_cpu_util_pct))
                    ? Math.max(0, Math.min(100, nm.peak_cpu_util_pct))
                    : 0,
                  peak_mem_util_pct: (typeof nm.peak_mem_util_pct === 'number' && isFinite(nm.peak_mem_util_pct))
                    ? Math.max(0, Math.min(100, nm.peak_mem_util_pct))
                    : 0,
                })),
                time_series: event.data.time_series
                  ? [validateTimeSeriesData(event.data.time_series)]
                  : [],
                workload_metrics: {
                  concurrent_users: { min: 0, max: 0, avg: 0 },
                  rps: { min: 0, max: 0, avg: 0 },
                  latency: { min_ms: 0, max_ms: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0 },
                },
              },
            };
          }

          // Update existing results
          // If all_time_series is provided (from completed run with full array), replace the entire array
          // Otherwise, append the new time_series entry for real-time updates
          const updatedTimeSeries = (event.data as any).all_time_series
            ? (event.data as any).all_time_series.map((ts: any) => validateTimeSeriesData(ts)) // Replace with full array from completed run
            : event.data.time_series
            ? [...currentRun.results.time_series, validateTimeSeriesData(event.data.time_series)]
            : currentRun.results.time_series;

          const eventSummary = event.data.summary;
          return {
            ...currentRun,
            results: {
              ...currentRun.results,
              summary: eventSummary
                ? {
                    total_requests: eventSummary.total_requests ?? currentRun.results.summary.total_requests,
                    successful_requests: eventSummary.successful_requests ?? currentRun.results.summary.successful_requests,
                    failed_requests: eventSummary.failed_requests ?? currentRun.results.summary.failed_requests,
                    avg_latency_ms: eventSummary.avg_latency_ms ?? currentRun.results.summary.avg_latency_ms,
                    p95_latency_ms: eventSummary.p95_latency_ms ?? currentRun.results.summary.p95_latency_ms,
                    p99_latency_ms: eventSummary.p99_latency_ms ?? currentRun.results.summary.p99_latency_ms,
                    avg_rps: eventSummary.avg_rps ?? currentRun.results.summary.avg_rps,
                    peak_rps: eventSummary.peak_rps ?? currentRun.results.summary.peak_rps,
                  }
                : currentRun.results.summary,
              node_metrics: (event.data.node_metrics || currentRun.results.node_metrics).map((nm: any) => ({
                ...nm,
                avg_cpu_util_pct: (typeof nm.avg_cpu_util_pct === 'number' && isFinite(nm.avg_cpu_util_pct))
                  ? Math.max(0, Math.min(100, nm.avg_cpu_util_pct))
                  : 0,
                avg_mem_util_pct: (typeof nm.avg_mem_util_pct === 'number' && isFinite(nm.avg_mem_util_pct))
                  ? Math.max(0, Math.min(100, nm.avg_mem_util_pct))
                  : 0,
                peak_cpu_util_pct: (typeof nm.peak_cpu_util_pct === 'number' && isFinite(nm.peak_cpu_util_pct))
                  ? Math.max(0, Math.min(100, nm.peak_cpu_util_pct))
                  : 0,
                peak_mem_util_pct: (typeof nm.peak_mem_util_pct === 'number' && isFinite(nm.peak_mem_util_pct))
                  ? Math.max(0, Math.min(100, nm.peak_mem_util_pct))
                  : 0,
              })),
              time_series: updatedTimeSeries,
            },
          };
        });
      },
      onStatusChange: async (event) => {
        addDebugEvent("status_change", event, event.data, "onStatusChange");
        // Fetch updated run from backend when status changes
        // This ensures we get the fully transformed run object
        try {
          const updatedRun = await getSimulationRun(id);
          if (updatedRun) {
            setRun(updatedRun);
          } else {
            // If run not found, just update status
            setRun((currentRun) => {
              if (!currentRun) return currentRun;
              return {
                ...currentRun,
                status: event.data.status,
              };
            });
          }
        } catch (error) {
          console.error("Failed to fetch updated run:", error);
          // Fallback: just update status
          setRun((currentRun) => {
            if (!currentRun) return currentRun;
            return {
              ...currentRun,
              status: event.data.status,
            };
          });
        }

        // Stop streaming if simulation is no longer running
        if (event.data.status !== "running") {
          stream.close();
          streamRef.current = null;
          setIsStreaming(false);
        }
      },
      onError: (event) => {
        console.error("[SimulationStream] Error:", event.data);
        addDebugEvent("error", event, event.data, "onError");
        setRun((currentRun) => {
          if (!currentRun) return currentRun;
          return {
            ...currentRun,
            error: event.data.error,
          };
        });
      },
      onComplete: async (event) => {
        addDebugEvent("complete", event, event.data, "onComplete");
        // Fetch final run state from backend
        try {
          const finalRun = await getSimulationRun(id);
          if (finalRun) {
            setRun(finalRun);
          }
        } catch (error) {
          console.error("Failed to fetch final run state:", error);
          // Use final results from event if available
          if (event.data.final_results) {
            setRun((currentRun) => {
              if (!currentRun) return currentRun;
              return {
                ...currentRun,
                results: event.data.final_results,
                status: "completed",
              };
            });
          }
        }

        // Close stream
        stream.close();
        streamRef.current = null;
        setIsStreaming(false);
      },
      onConnectionOpen: () => {
        setIsStreaming(true);
        addDebugEvent("connection", { state: "open" }, null, "onConnectionOpen");
      },
      onConnectionClose: () => {
        setIsStreaming(false);
        addDebugEvent("connection", { state: "closed" }, null, "onConnectionClose");
      },
      onConnectionError: (error) => {
        // Stream endpoint may not be available
        setIsStreaming(false);
        addDebugEvent("connection", { state: "error", error: error.message }, error, "onConnectionError");
      },
      reconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
    });

    streamRef.current = stream;
    stream.connect();

    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
        setIsStreaming(false);
      }
    };
  }, [id, run?.status]);

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{run.name}</h1>
              {isRunning && isStreaming && (
                <div className="flex items-center gap-1 text-green-400 text-xs">
                  <Wifi className="w-4 h-4" />
                  <span>Live</span>
                </div>
              )}
            </div>
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
      
      {/* Debug Panel Toggle */}
      {isRunning && (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm"
          >
            {showDebugPanel ? "Hide" : "Show"} SSE Debug Panel
          </button>
        </div>
      )}
      
      {/* Debug Panel */}
      {showDebugPanel && isRunning && (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">SSE Debug Stream</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm text-white/60">
                  {isStreaming ? "Connected" : "Disconnected"}
                </span>
              </div>
              <button
                onClick={() => setDebugEvents([])}
                className="px-3 py-1 bg-white/10 text-white rounded hover:bg-white/20 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            ref={debugPanelRef}
            className="bg-black/50 rounded border border-white/10 p-4 max-h-96 overflow-y-auto font-mono text-xs"
          >
            {debugEvents.length === 0 ? (
              <div className="text-white/40">No events received yet...</div>
            ) : (
              <div className="space-y-3">
                {debugEvents.map((event) => (
                  <div key={event.id} className="border-l-2 border-white/20 pl-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-400 font-semibold">{event.eventType || event.type}</span>
                      <span className="text-white/40 text-xs">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {event.parsedData && (
                      <div className="mb-2">
                        <div className="text-yellow-400 text-xs mb-1">Parsed Data:</div>
                        <pre className="text-green-400 whitespace-pre-wrap break-all">
                          {JSON.stringify(event.parsedData, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div>
                      <div className="text-yellow-400 text-xs mb-1">Raw Data:</div>
                      <pre className="text-white/70 whitespace-pre-wrap break-all">
                        {typeof event.rawData === 'string' ? event.rawData : JSON.stringify(event.rawData, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Results */}
      {hasResults && (
        <>
          {/* Summary Stats */}
          <SummaryStats results={run.results!} />

          {/* Resource Graph */}
          <div className="relative">
            <ResourceGraph
              timeSeriesData={run.results!.time_series || []}
              nodeMetrics={run.results!.node_metrics || []}
            />
          </div>

          {/* Combined Performance Chart (Multi-Axis) */}
          <div className="bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Overview (Multi-Axis)
            </h3>
            <MultiAxisChart
              data={run.results!.time_series || []}
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
                data={run.results!.time_series || []}
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
                data={run.results!.time_series || []}
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
          <div>
            <ResourceGraphViewer
              nodeMetrics={run.results!.node_metrics}
              config={run.config}
            />
          </div>

          {/* Node Metrics */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Node Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {run.results!.node_metrics.map((node) => (
                <NodeMetricsCard key={node.node_id} node={node} />
              ))}
            </div>
          </div>
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

      {/* Debug Information (Development Only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-card rounded-lg p-4 border border-border">
          <details className="text-sm">
            <summary className="text-white/80 cursor-pointer hover:text-white mb-2">
              🔍 Debug Information (Click to expand)
            </summary>
            <div className="mt-2 space-y-2 text-xs font-mono">
              <div>
                <span className="text-white/60">Status:</span>
                <span className="text-white ml-2">{run.status}</span>
              </div>
              <div>
                <span className="text-white/60">Has Results:</span>
                <span className="text-white ml-2">{hasResults ? "Yes" : "No"}</span>
              </div>
              <div>
                <span className="text-white/60">Is Streaming:</span>
                <span className="text-white ml-2">{isStreaming ? "Yes" : "No"}</span>
              </div>
              {run.results && (
                <div className="mt-4">
                  <div className="text-white/60 mb-1">Results Summary:</div>
                  <pre className="text-white/80 bg-black/20 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(
                      {
                        has_summary: !!run.results.summary,
                        has_node_metrics: !!run.results.node_metrics,
                        node_metrics_count: run.results.node_metrics?.length || 0,
                        has_time_series: !!run.results.time_series,
                        time_series_count: run.results.time_series?.length || 0,
                        summary: run.results.summary,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
              {!run.results && (
                <div className="text-yellow-400 mt-2">
                  ⚠️ No results object found in run data
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

