"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Play, Activity, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/api-client/http";
import { env } from "@/lib/env";

type BackendRunSummary = {
  // Backend may return either `run_id` or `id`
  run_id?: string;
  id?: string;
  status?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

// Normalise the ID regardless of which field the backend returns
function getRunId(run: BackendRunSummary): string {
  return (run.run_id ?? run.id ?? "") as string;
}

// Show the simulation name from metadata, or fall back to a truncated run ID
function getRunLabel(run: BackendRunSummary): string {
  const name = run.metadata?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  const id = getRunId(run);
  return id ? id : "Unnamed run";
}

type SimulationStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "stopped" | "stopping";

const statusConfig: Record<SimulationStatus, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawResponse, setRawResponse] = useState<any>(null);
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
          throw new Error(raw || `Failed to load simulation runs (HTTP ${res.status})`);
        }
        const data = await res.json();
        console.log("[SimulationPage] raw API response:", data);
        setRawResponse(data);
        const list: BackendRunSummary[] = Array.isArray(data)
          ? data
          : Array.isArray(data.runs)
          ? data.runs
          : Array.isArray(data.data)
          ? data.data
          : data.run
          ? [data.run]
          : [];
        setRuns(list);
      } catch (e) {
        console.error("Failed to load simulation runs:", e);
        setError(e instanceof Error ? e.message : "Failed to load simulation runs");
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Simulation runs</h1>
            <p className="text-sm text-white/60 mt-1">
              Project <span className="font-mono text-xs">{projectId}</span>
            </p>
          </div>
        </div>
        <Link
          href={`/project/${projectId}/simulation/new`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
        >
          <Play className="w-4 h-4" />
          New simulation
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Debug panel — remove once backend response shape is confirmed */}
      {rawResponse !== null && (
        <div className="rounded-lg border border-white/10 bg-white/5">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-white/50 hover:text-white/70"
          >
            <span>Raw API response (debug)</span>
            <span>{showRaw ? "▲ hide" : "▼ show"}</span>
          </button>
          {showRaw && (
            <pre className="px-4 pb-4 text-[11px] font-mono text-white/60 whitespace-pre-wrap break-all">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="space-y-3">
        {runs.length === 0 && !error ? (
          <div className="bg-card rounded-lg p-6 border border-border text-center space-y-4">
            <div>
              <p className="text-white/70 mb-1">No simulation runs for this project yet.</p>
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
              const runId = getRunId(run);
              const label = getRunLabel(run);
              const rawStatus = typeof run.status === "string"
                ? run.status.toLowerCase().replace(/^run_status_/, "")
                : "pending";
              const statusKey = (rawStatus in statusConfig ? rawStatus : "pending") as SimulationStatus;
              const status = statusConfig[statusKey];
              return (
                <li
                  key={runId || JSON.stringify(run)}
                  className="bg-card rounded-lg border border-border p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{label}</p>
                    <p className="font-mono text-xs text-white/40 truncate mt-0.5">{runId}</p>
                    {run.created_at && (
                      <p className="text-xs text-white/30 mt-1">
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bgColor}`}
                    >
                      {status.icon}
                      {status.label}
                    </span>
                    <Link
                      href={`/project/${projectId}/simulation/${encodeURIComponent(runId)}`}
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

