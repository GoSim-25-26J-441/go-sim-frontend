"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Play,
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Plus,
  BarChart3,
  Activity,
  ArrowLeft,
} from "lucide-react";
import { SimulationRun, SimulationStatus } from "@/types/simulation";
import {
  getSimulationRuns,
  startSimulationRun,
  stopSimulationRun,
} from "@/lib/api-client/simulation";

const statusConfig: Record<
  SimulationStatus,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  pending: {
    label: "Pending",
    icon: <Clock className="w-4 h-4" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
  },
  running: {
    label: "Running",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-green-400",
    bgColor: "bg-green-400/10",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="w-4 h-4" />,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
  cancelled: {
    label: "Cancelled",
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
  },
};

function formatDuration(seconds?: number): string {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export default function ProjectSimulationListPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<SimulationStatus | "all">("all");

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    getSimulationRuns(projectId)
      .then((data) => {
        setRuns(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load simulation runs:", error);
        setLoading(false);
      });
  }, [projectId]);

  const filteredRuns =
    selectedStatus === "all"
      ? runs
      : runs.filter((run) => run.status === selectedStatus);

  const handleNewSimulation = () => {
    router.push(`/project/${projectId}/simulation/new`);
  };

  const handleViewDetails = (runId: string) => {
    router.push(`/project/${projectId}/simulation/${runId}`);
  };

  const refreshList = () => {
    if (projectId) {
      getSimulationRuns(projectId).then(setRuns).catch(console.error);
    }
  };

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project not found.</p>
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/project/${projectId}/summary`}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Simulation runs</h1>
            <p className="text-sm text-white/60 mt-1">
              Manage and monitor simulation runs for this project
            </p>
          </div>
        </div>
        <button
          onClick={handleNewSimulation}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          New simulation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Total runs</p>
              <p className="text-2xl font-bold text-white mt-1">{runs.length}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-white/40" />
          </div>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Running</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {runs.filter((r) => r.status === "running").length}
              </p>
            </div>
            <Activity className="w-8 h-8 text-blue-400/40" />
          </div>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Completed</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {runs.filter((r) => r.status === "completed").length}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-400/40" />
          </div>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">Failed</p>
              <p className="text-2xl font-bold text-red-400 mt-1">
                {runs.filter((r) => r.status === "failed").length}
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-400/40" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["all", "running", "completed", "failed", "pending"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-4 py-2 font-medium transition-colors ${
              selectedStatus === status
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {status === "all" ? "All" : statusConfig[status].label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredRuns.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <p>No simulation runs in this project</p>
          </div>
        ) : (
          filteredRuns.map((run) => {
            const status = statusConfig[run.status];
            return (
              <div
                key={run.id}
                className="bg-card rounded-lg border border-border p-4 hover:border-white/20 transition-colors cursor-pointer"
                onClick={() => handleViewDetails(run.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{run.name}</h3>
                      <span
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bgColor}`}
                      >
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mb-3">{run.config.description ?? ""}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-white/60">Nodes:</span>
                        <span className="text-white ml-2">{run.config.nodes}</span>
                      </div>
                      <div>
                        <span className="text-white/60">Users:</span>
                        <span className="text-white ml-2">
                          {run.config.workload.concurrent_users.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Duration:</span>
                        <span className="text-white ml-2">
                          {formatDuration(run.duration_seconds)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Created:</span>
                        <span className="text-white ml-2">{formatDate(run.created_at)}</span>
                      </div>
                    </div>
                    {run.results && (
                      <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-white/60">Avg RPS:</span>
                          <span className="text-white ml-2">
                            {run.results.summary.avg_rps.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/60">Peak RPS:</span>
                          <span className="text-white ml-2">
                            {run.results.summary.peak_rps.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/60">Avg Latency:</span>
                          <span className="text-white ml-2">
                            {run.results.summary.avg_latency_ms.toFixed(1)}ms
                          </span>
                        </div>
                        <div>
                          <span className="text-white/60">P95 Latency:</span>
                          <span className="text-white ml-2">
                            {run.results.summary.p95_latency_ms.toFixed(1)}ms
                          </span>
                        </div>
                      </div>
                    )}
                    {run.error && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-sm text-red-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {run.error}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {run.status === "completed" && run.results && (
                      <Link
                        href="/cost"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="View analysis dashboard"
                      >
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                      </Link>
                    )}
                    {run.status === "running" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await stopSimulationRun(run.id);
                            refreshList();
                          } catch (error) {
                            console.error("Failed to stop simulation:", error);
                          }
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Stop simulation"
                      >
                        <Square className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                    {run.status === "pending" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await startSimulationRun(run.id);
                            refreshList();
                          } catch (error) {
                            console.error("Failed to start simulation:", error);
                          }
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Start simulation"
                      >
                        <Play className="w-4 h-4 text-green-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
