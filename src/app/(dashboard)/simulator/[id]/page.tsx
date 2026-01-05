"use client";

import { useState, useEffect } from "react";
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
import { SimulationRun } from "@/types/simulation";
import { getSimulationRun, stopSimulationRun } from "@/lib/api-client/simulation";
import { MetricsChart } from "@/components/simulation/MetricsChart";
import { MultiAxisChart } from "@/components/simulation/MultiAxisChart";
import { NodeMetricsCard } from "@/components/simulation/NodeMetricsCard";
import { SummaryStats } from "@/components/simulation/SummaryStats";
import { ResourceGraph } from "@/components/simulation/ResourceGraph";
import { ResourceGraphViewer } from "@/components/simulation/ResourceGraphViewer";
import { DynamicConfigControl } from "@/components/simulation/DynamicConfigControl";

export default function SimulationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch simulation run from API (currently uses dummy data)
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

      {/* Results */}
      {hasResults && (
        <>
          {/* Summary Stats */}
          <SummaryStats results={run.results!} />

          {/* Resource Graph */}
          <div className="relative">
            <ResourceGraph
              timeSeriesData={run.results!.time_series}
              nodeMetrics={run.results!.node_metrics}
            />
          </div>

          {/* Combined Performance Chart (Multi-Axis) */}
          <div className="bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Overview (Multi-Axis)
            </h3>
            <MultiAxisChart
              data={run.results!.time_series}
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
                data={run.results!.time_series}
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
                data={run.results!.time_series}
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
    </div>
  );
}

