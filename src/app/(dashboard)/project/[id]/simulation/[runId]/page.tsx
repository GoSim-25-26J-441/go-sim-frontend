"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Square, Wifi, WifiOff } from "lucide-react";
import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { startSimulationRun, stopSimulationRun } from "@/lib/api-client/simulation";

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceConfig {
  id: string;
  replicas?: number;
  [key: string]: unknown;
}

interface OptimizationStepConfig {
  services?: ServiceConfig[];
  workload?: unknown[];
  hosts?: unknown[];
}

interface OptimizationStep {
  iteration_index: number;
  target_p95_ms: number;
  score_p95_ms: number;
  reason: string;
  previous_config?: OptimizationStepConfig;
  current_config?: OptimizationStepConfig;
}

interface RunInfo {
  run_id: string;
  engine_run_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  metadata?: {
    name?: string;
    description?: string;
    mode?: string;
    objective?: string;
    // optimization summary (batch)
    best_run_id?: string;
    best_score?: number;
    iterations?: number;
    top_candidates?: string[];
    // online optimization history
    optimization_history?: OptimizationStep[];
    [key: string]: unknown;
  };
}

interface SseEvent {
  uid: string;
  type: string;
  data: string;
  timestamp: string;
}

export interface SsePanelHandle {
  connect: () => void;
  abort: () => void;
}

interface SsePanelProps {
  title: string;
  url: string;
  onRunUpdate?: (run: RunInfo) => void;
  onEvent?: (type: string, data: string) => void;
  onTerminalEvent?: () => void;
  onStreamClose?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  running:   "text-blue-400   bg-blue-400/10   border-blue-400/20",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  failed:    "text-red-400    bg-red-400/10    border-red-400/20",
  cancelled: "text-gray-400   bg-gray-400/10   border-gray-400/20",
  stopped:   "text-gray-400   bg-gray-400/10   border-gray-400/20",
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  initial:               "bg-slate-500/20 text-slate-300",
  metrics:               "bg-sky-500/20 text-sky-300",
  metric_update:         "bg-sky-500/20 text-sky-300",
  metrics_snapshot:      "bg-cyan-500/20 text-cyan-300",
  error:                 "bg-red-500/20 text-red-300",
  done:                  "bg-emerald-500/20 text-emerald-300",
  complete:              "bg-emerald-500/20 text-emerald-300",
  completed:             "bg-emerald-500/20 text-emerald-300",
  stopped:               "bg-gray-500/20 text-gray-300",
  best:                  "bg-amber-500/20 text-amber-300",
  status:                "bg-purple-500/20 text-purple-300",
  status_change:         "bg-purple-500/20 text-purple-300",
  update:                "bg-indigo-500/20 text-indigo-300",
  optimization_progress: "bg-amber-500/20 text-amber-300",
  optimization_step:     "bg-orange-500/20 text-orange-300",
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "stopped"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripCr(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function formatData(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 4000) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      /* not valid JSON */
    }
  }
  return raw;
}

// ── SsePanel — proper forwardRef component ───────────────────────────────────

const MAX_EVENTS = 1000;
const PAGE_SIZE  = 50;

const SsePanel = forwardRef<SsePanelHandle, SsePanelProps>(
  ({ title, url, onRunUpdate, onEvent, onTerminalEvent, onStreamClose }, ref) => {
    const [events, setEvents]     = useState<SseEvent[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError]       = useState<string | null>(null);
    // page index (0-based); "following" auto-advances to the last page
    const [page, setPage]         = useState(0);
    const [following, setFollowing] = useState(true);

    const logRef   = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const seqRef   = useRef(0);

    // Derived pager values
    const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pageEvents  = events.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    // When following, jump to the last page whenever the total grows
    useEffect(() => {
      if (following) setPage(Math.max(0, totalPages - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalPages, following]);

    // Scroll to top of the log whenever the displayed page changes
    useEffect(() => {
      if (logRef.current) logRef.current.scrollTop = 0;
    }, [currentPage]);

    const goFirst = () => { setFollowing(false); setPage(0); };
    const goPrev  = () => { setFollowing(false); setPage((p) => Math.max(0, p - 1)); };
    const goNext  = () => {
      const next = Math.min(currentPage + 1, totalPages - 1);
      setPage(next);
      if (next === totalPages - 1) setFollowing(true);
    };
    const goLast  = () => { setPage(totalPages - 1); setFollowing(true); };

    const connect = useCallback(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);

      try {
        const token = await getFirebaseIdToken();
        const res = await fetch(url, {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          setError(`HTTP ${res.status} — stream unavailable`);
          setConnected(false);
          return;
        }

        setConnected(true);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let pending: { type?: string; data?: string } = {};
          const batch: SseEvent[] = [];
          let terminalSeen = false;
          // Collect run-update payloads — apply after state flush
          const runUpdates: RunInfo[] = [];

          for (const raw of lines) {
            const line = stripCr(raw);

            if (line.startsWith("event:")) {
              pending.type = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              pending.data = (pending.data ?? "") + line.slice(5).trimStart();
            } else if (line === "") {
              if (pending.data !== undefined) {
                seqRef.current += 1;
                const uid = `${seqRef.current}`;
                const eventType = pending.type ?? "message";

                batch.push({
                  uid,
                  type: eventType,
                  data: pending.data,
                  timestamp: new Date().toISOString(),
                });

                // "initial" and "update" both carry { run: RunInfo }
                if (eventType === "initial" || eventType === "update") {
                  try {
                    const parsed = JSON.parse(pending.data) as { run?: RunInfo };
                    if (parsed.run) {
                      runUpdates.push(parsed.run);
                      if (TERMINAL_STATUSES.has(parsed.run.status)) {
                        terminalSeen = true;
                      }
                    }
                  } catch { /* malformed JSON — ignore */ }
                }

                // Fire generic event callback for caller-side handling
                onEvent?.(eventType, pending.data);

                // Legacy / direct terminal event types
                if (["done", "complete", "completed", "stopped", "failed"].includes(eventType)) {
                  terminalSeen = true;
                }
              }
              pending = {};
            }
          }

          if (batch.length > 0) {
            setEvents((prev) => [...prev, ...batch].slice(-MAX_EVENTS));
          }
          // Fire callbacks after state update is queued
          for (const run of runUpdates) {
            onRunUpdate?.(run);
          }
          if (terminalSeen) onTerminalEvent?.();
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(`Stream error: ${(e as Error).message}`);
        }
      } finally {
        setConnected(false);
        if (!controller.signal.aborted) {
          onStreamClose?.();
        }
      }
    }, [url, onRunUpdate, onEvent, onTerminalEvent, onStreamClose]);

    useImperativeHandle(ref, () => ({
      connect,
      abort: () => abortRef.current?.abort(),
    }));

    // Cleanup on unmount
    useEffect(() => () => { abortRef.current?.abort(); }, []);

    return (
      <div className="bg-card border border-border rounded-lg flex flex-col min-h-[460px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <div className="flex items-center gap-3">
            {connected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Wifi className="w-3.5 h-3.5" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-white/30">
                <WifiOff className="w-3.5 h-3.5" />
                Disconnected
              </span>
            )}
            <span className="text-xs text-white/30">{events.length} events</span>
            <button
              onClick={() => { setEvents([]); setPage(0); setFollowing(true); }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear
            </button>
            {!connected && (
              <button
                onClick={connect}
                className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Event log — only renders PAGE_SIZE rows */}
        <div ref={logRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 select-none gap-2">
              <Wifi className="w-7 h-7 opacity-30" />
              <p>{connected ? "Waiting for events…" : "Not connected."}</p>
            </div>
          ) : (
            pageEvents.map((ev) => (
              <div
                key={ev.uid}
                className="flex gap-2 items-start hover:bg-white/5 rounded px-2 py-1"
              >
                <span className="text-white/25 shrink-0 tabular-nums select-none">
                  {ev.timestamp.slice(11, 23)}
                </span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium self-start ${
                    EVENT_TYPE_STYLES[ev.type] ?? "bg-white/10 text-white/50"
                  }`}
                >
                  {ev.type}
                </span>
                {ev.data ? (
                  <pre className="flex-1 min-w-0 break-all whitespace-pre-wrap text-white/70 leading-relaxed">
                    {formatData(ev.data)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Pagination footer */}
        {events.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border shrink-0 gap-2">
            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={goFirst}
                disabled={currentPage === 0}
                className="px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title="First page"
              >
                «
              </button>
              <button
                onClick={goPrev}
                disabled={currentPage === 0}
                className="px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title="Previous page"
              >
                ‹
              </button>
              <span className="text-xs text-white/40 px-2 tabular-nums select-none">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={goNext}
                disabled={currentPage >= totalPages - 1}
                className="px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title="Next page"
              >
                ›
              </button>
              <button
                onClick={goLast}
                disabled={currentPage >= totalPages - 1}
                className="px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title="Last page"
              >
                »
              </button>
            </div>

            {/* Follow toggle */}
            <button
              onClick={() => { setFollowing((f) => !f); if (!following) goLast(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                following
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                  : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
              }`}
              title={following ? "Following latest events — click to lock view" : "Click to follow latest events"}
            >
              {following ? "● Following" : "○ Follow latest"}
            </button>
          </div>
        )}
      </div>
    );
  }
);
SsePanel.displayName = "SsePanel";

// ── Main page ────────────────────────────────────────────────────────────────

export default function SimulationRunPage() {
  const params = useParams();
  const projectId = params.id as string;
  const runId = params.runId as string;

  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [runLoading, setRunLoading] = useState(true);
  const [runError, setRunError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  // Online optimization timeline — seeded from metadata on load, appended via SSE
  const [optSteps, setOptSteps] = useState<OptimizationStep[]>([]);

  const simRef = useRef<SsePanelHandle>(null);
  const fetchRunInfoRef = useRef<() => Promise<RunInfo | null>>(() => Promise.resolve(null));

  // ── Run info fetch ──────────────────────────────────────────────────────────

  const fetchRunInfo = useCallback(async (): Promise<RunInfo | null> => {
    try {
      const token = await getFirebaseIdToken();
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { run: RunInfo };
      setRunInfo(data.run);
      setRunError(null);
      if (data.run.metadata?.optimization_history?.length) {
        setOptSteps(data.run.metadata.optimization_history);
      }
      return data.run;
    } catch (e) {
      setRunError((e as Error).message);
      return null;
    } finally {
      setRunLoading(false);
    }
  }, [runId]);

  useEffect(() => { fetchRunInfoRef.current = fetchRunInfo; }, [fetchRunInfo]);

  // Apply run data received directly from an SSE "initial" or "update" event
  const handleRunUpdate = useCallback((run: RunInfo) => {
    setRunInfo(run);
    setRunError(null);
    setRunLoading(false);
    // Seed timeline from persisted optimization_history (present on load / reload)
    if (run.metadata?.optimization_history?.length) {
      setOptSteps(run.metadata.optimization_history);
    }
  }, []);

  // Handle individual SSE events that need page-level processing
  const handleSseEvent = useCallback((type: string, data: string) => {
    if (type === "optimization_step") {
      try {
        // Payload shape: { event, run_id, data: OptimizationStep }
        const payload = JSON.parse(data) as { data?: OptimizationStep };
        const step = payload.data;
        if (step && step.iteration_index != null) {
          setOptSteps((prev) => {
            // Avoid duplicates if the same step arrives twice
            const exists = prev.some((s) => s.iteration_index === step.iteration_index);
            return exists ? prev : [...prev, step];
          });
        }
      } catch { /* malformed — ignore */ }
    }
  }, []);

  // Fallback: re-fetch from API (used on stream close / legacy terminal events)
  const refreshStatus = useCallback(() => { fetchRunInfoRef.current(); }, []);

  // ── On mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchRunInfo().then((run) => {
      if (run?.status === "running") {
        simRef.current?.connect();
      }
    });
    return () => {
      simRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startSimulationRun(runId);
      await fetchRunInfo();
      simRef.current?.connect();
    } catch (e) {
      console.error("Failed to start run:", e);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async (mode: "stopped" | "completed" | "cancelled" = "stopped") => {
    setIsStopping(true);
    setStopError(null);
    try {
      await stopSimulationRun(runId, mode);
      // Let the SSE "update" event drive the status change. Abort the stream
      // only after the stop is confirmed so the terminal event can arrive first.
      simRef.current?.abort();
      await fetchRunInfo();
    } catch (e) {
      setStopError((e as Error).message);
      console.error("Failed to stop run:", e);
    } finally {
      setIsStopping(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const status = runInfo?.status ?? "pending";
  const runName = (runInfo?.metadata?.name as string | undefined) ?? runId;
  const statusStyle = STATUS_STYLES[status] ?? "text-white/60 bg-white/10 border-white/10";
  const isTerminal = ["completed", "failed", "cancelled", "stopped"].includes(status);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/project/${projectId}/simulation`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{runName}</h1>
          <p className="text-xs text-white/40 font-mono mt-0.5 truncate">run / {runId}</p>
        </div>
        {runInfo && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle}`}>
            {status}
          </span>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {stopError && (
          <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            Stop failed: {stopError}
          </span>
        )}
        {status === "pending" && (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Start Run
          </button>
        )}

        {status === "running" && (
          <>
            <button
              onClick={() => handleStop("stopped")}
              disabled={isStopping}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Stop the simulation (stored as stopped)"
            >
              {isStopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Stop
            </button>
            <button
              onClick={() => handleStop("completed")}
              disabled={isStopping}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="End the online run and mark it as successfully completed"
            >
              {isStopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Complete
            </button>
            <button
              onClick={() => handleStop("cancelled")}
              disabled={isStopping}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Abort and cancel the simulation"
            >
              {isStopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Cancel
            </button>
          </>
        )}

        <button
          onClick={fetchRunInfo}
          className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Run details */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-white">Run details</h2>
        {runLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : runError ? (
          <p className="text-xs text-red-400">{runError}</p>
        ) : runInfo ? (
          <>
            {/* Core fields */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
              <div>
                <dt className="text-white/40 mb-0.5">Run ID</dt>
                <dd className="font-mono text-white/80 break-all">{runInfo.run_id}</dd>
              </div>
              {runInfo.engine_run_id && (
                <div>
                  <dt className="text-white/40 mb-0.5">Engine Run ID</dt>
                  <dd className="font-mono text-white/80 break-all">{runInfo.engine_run_id}</dd>
                </div>
              )}
              <div>
                <dt className="text-white/40 mb-0.5">Status</dt>
                <dd>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${statusStyle}`}>
                    {runInfo.status}
                  </span>
                </dd>
              </div>
              {runInfo.metadata?.mode && (
                <div>
                  <dt className="text-white/40 mb-0.5">Mode</dt>
                  <dd className="text-white/80 capitalize">{runInfo.metadata.mode as string}</dd>
                </div>
              )}
              {runInfo.created_at && (
                <div>
                  <dt className="text-white/40 mb-0.5">Created</dt>
                  <dd className="text-white/80">{new Date(runInfo.created_at).toLocaleString()}</dd>
                </div>
              )}
              {runInfo.updated_at && (
                <div>
                  <dt className="text-white/40 mb-0.5">Last updated</dt>
                  <dd className="text-white/80">{new Date(runInfo.updated_at).toLocaleString()}</dd>
                </div>
              )}
              {runInfo.completed_at && (
                <div>
                  <dt className="text-white/40 mb-0.5">Completed at</dt>
                  <dd className="text-white/80">{new Date(runInfo.completed_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>

            {/* Optimization summary (populated by engine callback) */}
            {runInfo.metadata && (
              runInfo.metadata.best_score != null ||
              runInfo.metadata.iterations != null
            ) && (
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">
                  Optimization summary
                </h3>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                  {runInfo.metadata.iterations != null && (
                    <div>
                      <dt className="text-white/40 mb-0.5">Iterations</dt>
                      <dd className="text-white/80 font-mono">{String(runInfo.metadata.iterations)}</dd>
                    </div>
                  )}
                  {runInfo.metadata.best_score != null && (
                    <div>
                      <dt className="text-white/40 mb-0.5">Best score</dt>
                      <dd className="text-white/80 font-mono">
                        {typeof runInfo.metadata.best_score === "number"
                          ? runInfo.metadata.best_score.toFixed(4)
                          : String(runInfo.metadata.best_score)}
                      </dd>
                    </div>
                  )}
                  {runInfo.metadata.objective && (
                    <div>
                      <dt className="text-white/40 mb-0.5">Objective</dt>
                      <dd className="text-white/80">{String(runInfo.metadata.objective)}</dd>
                    </div>
                  )}
                  {runInfo.metadata.best_run_id && (
                    <div>
                      <dt className="text-white/40 mb-0.5">Best run ID</dt>
                      <dd className="font-mono text-white/70 break-all text-[10px]">
                        {String(runInfo.metadata.best_run_id)}
                      </dd>
                    </div>
                  )}
                  {runInfo.metadata.top_candidates && Array.isArray(runInfo.metadata.top_candidates) && runInfo.metadata.top_candidates.length > 0 && (
                    <div className="col-span-2 md:col-span-4">
                      <dt className="text-white/40 mb-1">Top candidates</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {(runInfo.metadata.top_candidates as string[]).map((id, i) => (
                          <span
                            key={id}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            title={id}
                          >
                            #{i + 1} {id.slice(0, 8)}…
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Optimization timeline — online optimization runs only */}
      {optSteps.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Optimization timeline
              <span className="ml-2 text-xs font-normal text-white/40">
                {optSteps.length} step{optSteps.length !== 1 ? "s" : ""}
              </span>
            </h2>
            {status === "running" && (
              <span className="flex items-center gap-1.5 text-xs text-orange-400">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {[...optSteps].reverse().map((step) => {
              const overTarget = step.score_p95_ms > step.target_p95_ms;
              return (
                <div
                  key={step.iteration_index}
                  className="rounded-lg border border-border bg-black/20 p-3 text-xs space-y-2"
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-white/40 shrink-0">
                      #{step.iteration_index}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono font-medium ${
                        overTarget
                          ? "bg-red-500/15 text-red-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      p95 {step.score_p95_ms.toFixed(1)} ms
                    </span>
                    <span className="text-white/30">
                      target {step.target_p95_ms.toFixed(0)} ms
                    </span>
                    <span className="text-white/50 italic flex-1">{step.reason}</span>
                  </div>

                  {/* Config diff — services replicas */}
                  {step.previous_config && step.current_config && (() => {
                    const prev = step.previous_config.services ?? [];
                    const curr = step.current_config.services ?? [];
                    const changes = curr.filter((cs) => {
                      const ps = prev.find((s) => s.id === cs.id);
                      return ps && ps.replicas !== cs.replicas;
                    });
                    if (changes.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                        {changes.map((cs) => {
                          const ps = prev.find((s) => s.id === cs.id)!;
                          return (
                            <span key={cs.id} className="font-mono text-[11px] text-white/60">
                              {cs.id}:
                              <span className="text-red-400 mx-1">{ps.replicas}</span>
                              →
                              <span className="text-emerald-400 ml-1">{cs.replicas}</span>
                              <span className="text-white/30 ml-1">replicas</span>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event stream */}
      <SsePanel
        ref={simRef}
        title="Event stream"
        url={`${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/events`}
        onRunUpdate={handleRunUpdate}
        onEvent={handleSseEvent}
        onTerminalEvent={refreshStatus}
        onStreamClose={refreshStatus}
      />
    </div>
  );
}
