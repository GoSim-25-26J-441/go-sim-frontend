"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Play,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/api-client/http";
import { env } from "@/lib/env";

type BackendRunSummary = {
  run_id: string;
  user_id?: string;
  project_id?: string;
  engine_run_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  metadata?: {
    name?: string;
    description?: string;
    mode?: string;
    objective?: string;
    max_iterations?: number;
    // optimization summary populated by engine callback
    best_run_id?: string;
    best_score?: number;
    iterations?: number;
    top_candidates?: string[];
    [key: string]: unknown;
  };
};

function getRunLabel(run: BackendRunSummary): string {
  const name = run.metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return run.run_id ?? "Unnamed run";
}

const MODE_LABELS: Record<string, string> = {
  standard: "Standard",
  batch: "Batch",
  online: "Online",
  batch_optimization: "Batch",
  online_optimization: "Online",
};

type SimulationStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopped"
  | "stopping";

const statusConfig: Record<
  SimulationStatus,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  pending: {
    label: "Pending",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
  },
  running: {
    label: "Running",
    icon: <Activity className="w-4 h-4" />,
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
  stopped: {
    label: "Stopped",
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
  },
  stopping: {
    label: "Stopping",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
  },
};

export default function ProjectSimulationPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string | undefined;

  const [runs, setRuns] = useState<BackendRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setError("Missing project ID in route.");
      setLoading(false);
      return;
    }

    const fetchRuns = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authenticatedFetch(
          `${env.BACKEND_BASE}/api/v1/simulation/projects/${encodeURIComponent(projectId)}/runs`,
          { method: "GET" },
        );
        if (!res.ok) {
          const raw = await res.text();
          throw new Error(
            raw || `Failed to load simulation runs (HTTP ${res.status})`,
          );
        }
        const data = await res.json();
        setRawResponse(data);

        // Normalise into BackendRunSummary[]. Handles:
        //   { runs: [{...}, ...] }   ← current backend shape
        //   { run: {...} }           ← single-run responses
        //   [{...}, ...]             ← bare array
        //   { runs: ["id1", ...] }   ← legacy plain-ID list (kept for safety)
        const rawList: unknown[] = Array.isArray(data)
          ? data
          : Array.isArray(data.runs)
            ? data.runs
            : data.run
              ? [data.run]
              : [];

        const list: BackendRunSummary[] = rawList.map((item) =>
          typeof item === "string"
            ? { run_id: item }
            : (item as BackendRunSummary),
        );
        setRuns(list);
      } catch (e) {
        console.error("Failed to load simulation runs:", e);
        setError(
          e instanceof Error ? e.message : "Failed to load simulation runs",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project ID missing in URL.</p>
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
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-md font-bold text-white flex items-center gap-2">
            Simulation runs
          </h1>
        </div>
        <Link
          href={`/project/${projectId}/simulation/new`}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
        >
          <Play className="w-3 h-3" />
          New simulation
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {rawResponse !== null && (
        <div className="rounded-lg border border-white/10 bg-white/5 text-xs">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-white/40 hover:text-white/70 transition-colors"
          >
            <span className="font-mono">Raw API response</span>
            <span>{showRaw ? "▲ hide" : "▼ show"}</span>
          </button>
          {showRaw && (
            <pre className="px-4 pb-4 font-mono text-[11px] text-white/60 whitespace-pre-wrap break-all border-t border-white/10 pt-3">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="space-y-3">
        {runs.length === 0 && !error ? (
          <div className="bg-card rounded-lg p-6 border border-border text-center space-y-4">
            <div>
              <p className="text-white/70 mb-1">
                No simulation runs for this project yet.
              </p>
              <p className="text-white/50 text-sm">
                Start a new simulation to see it appear here.
              </p>
            </div>
            <Link
              href={`/project/${projectId}/simulation/new`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
            >
              <Play className="w-4 h-4" />
              New simulation
            </Link>
          </div>
        ) : null}

        {runs.length > 0 && (
          <ul className="space-y-3">
            {runs.map((run) => {
              const label = getRunLabel(run);
              const rawStatus =
                typeof run.status === "string"
                  ? run.status.toLowerCase().replace(/^run_status_/, "")
                  : "pending";
              const statusKey = (
                rawStatus in statusConfig ? rawStatus : "pending"
              ) as SimulationStatus;
              const status = statusConfig[statusKey];
              const mode = run.metadata?.mode;
              const modeLabel =
                typeof mode === "string" ? (MODE_LABELS[mode] ?? mode) : null;
              const isRunning = statusKey === "running";
              return (
                <li
                  key={run.run_id}
                  className="bg-card rounded-lg border border-border p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Name + mode badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white truncate">
                        {label}
                      </p>
                      {modeLabel && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/60">
                          {modeLabel}
                        </span>
                      )}
                      {run.metadata?.objective && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-300">
                          {String(run.metadata.objective)}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {run.metadata?.description && (
                      <p className="text-xs text-white/50 truncate">
                        {String(run.metadata.description)}
                      </p>
                    )}

                    {/* IDs */}
                    <p className="font-mono text-xs text-white/30 truncate">
                      {run.run_id}
                      {run.engine_run_id && (
                        <span className="ml-2 text-white/20">
                          · engine: {run.engine_run_id}
                        </span>
                      )}
                    </p>

                    {/* Timestamps */}
                    <div className="flex items-center gap-3 text-[11px] text-white/30">
                      {run.created_at && (
                        <span>
                          Created {new Date(run.created_at).toLocaleString()}
                        </span>
                      )}
                      {run.completed_at && (
                        <span>
                          · Ended {new Date(run.completed_at).toLocaleString()}
                        </span>
                      )}
                      {!run.completed_at && run.updated_at && isRunning && (
                        <span>
                          · Updated {new Date(run.updated_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Optimization summary */}
                    {(run.metadata?.best_score != null ||
                      run.metadata?.iterations != null) && (
                      <div className="flex items-center gap-3 text-[11px] flex-wrap pt-0.5">
                        {run.metadata.iterations != null && (
                          <span className="text-white/40">
                            <span className="text-white/20">Iterations </span>
                            <span className="font-mono text-amber-300/80">
                              {String(run.metadata.iterations)}
                            </span>
                          </span>
                        )}
                        {run.metadata.best_score != null && (
                          <span className="text-white/40">
                            <span className="text-white/20">Best score </span>
                            <span className="font-mono text-amber-300/80">
                              {typeof run.metadata.best_score === "number"
                                ? (run.metadata.objective === "cpu_utilization" ||
                                  run.metadata.objective === "memory_utilization")
                                  ? `${(run.metadata.best_score * 100).toFixed(2)}%`
                                  : run.metadata.best_score.toFixed(4)
                                : String(run.metadata.best_score)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pt-0.5">
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bgColor}`}
                    >
                      {status.icon}
                      {status.label}
                    </span>
                    <Link
                      href={`/project/${projectId}/simulation/${encodeURIComponent(run.run_id)}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      View
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
