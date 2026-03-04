"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Square, Wifi, WifiOff } from "lucide-react";
import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { startSimulationRun } from "@/lib/api-client/simulation";

// ---- Types ----------------------------------------------------------------

interface RunInfo {
  run_id: string;
  engine_run_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

interface SseEvent {
  uid: string;
  type: string;
  data: string;
  timestamp: string;
}

// ---- Helpers ---------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  running:   "text-blue-400   bg-blue-400/10   border-blue-400/20",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  failed:    "text-red-400    bg-red-400/10    border-red-400/20",
  cancelled: "text-gray-400   bg-gray-400/10   border-gray-400/20",
  stopped:   "text-gray-400   bg-gray-400/10   border-gray-400/20",
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  metrics:  "bg-sky-500/20 text-sky-300",
  error:    "bg-red-500/20 text-red-300",
  done:     "bg-emerald-500/20 text-emerald-300",
  best:     "bg-amber-500/20 text-amber-300",
};

// ---- Page ------------------------------------------------------------------

export default function SimulationRunPage() {
  const params = useParams();
  const projectId = params.id as string;
  const runId = params.runId as string;

  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [runLoading, setRunLoading] = useState(true);
  const [runError, setRunError] = useState<string | null>(null);

  const [events, setEvents] = useState<SseEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseError, setSseError] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const eventLogRef = useRef<HTMLDivElement>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const eventCountRef = useRef(0);

  // ---- Data fetching --------------------------------------------------------

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
      return data.run;
    } catch (e) {
      setRunError((e as Error).message);
      return null;
    } finally {
      setRunLoading(false);
    }
  }, [runId]);

  // ---- SSE stream -----------------------------------------------------------

  const connectSse = useCallback(async (id: string) => {
    // Cancel any existing connection
    sseAbortRef.current?.abort();
    const controller = new AbortController();
    sseAbortRef.current = controller;

    setSseError(null);

    try {
      const token = await getFirebaseIdToken();
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(id)}/events`;

      const res = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        setSseError(`Stream unavailable (HTTP ${res.status})`);
        setSseConnected(false);
        return;
      }

      setSseConnected(true);

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

        let pending: { type?: string; data?: string; id?: string } = {};

        for (const line of lines) {
          if (line.startsWith("event:")) {
            pending.type = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            pending.data = (pending.data ?? "") + line.slice(5).trim();
          } else if (line.startsWith("id:")) {
            pending.id = line.slice(3).trim();
          } else if (line === "") {
            if (pending.data !== undefined) {
              eventCountRef.current += 1;
              const uid = pending.id ?? String(eventCountRef.current);
              setEvents((prev) => [
                ...prev.slice(-299), // keep last 300 events
                {
                  uid,
                  type: pending.type ?? "message",
                  data: pending.data!,
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
            pending = {};
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setSseError(`Stream error: ${(e as Error).message}`);
      }
    } finally {
      setSseConnected(false);
    }
  }, []);

  // Auto-scroll event log to bottom
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  // On mount: fetch run, then auto-connect SSE if already running
  useEffect(() => {
    fetchRunInfo().then((run) => {
      if (run?.status === "running") {
        connectSse(run.run_id);
      }
    });
    return () => {
      sseAbortRef.current?.abort();
    };
  }, [fetchRunInfo, connectSse]);

  // ---- Controls -------------------------------------------------------------

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startSimulationRun(runId);
      const run = await fetchRunInfo();
      if (run) connectSse(run.run_id);
    } catch (e) {
      console.error("Failed to start run:", e);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const token = await getFirebaseIdToken();
      await fetch(
        `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: "stopped" }),
        }
      );
      sseAbortRef.current?.abort();
      await fetchRunInfo();
    } catch (e) {
      console.error("Failed to stop run:", e);
    } finally {
      setIsStopping(false);
    }
  };

  // ---- Derived values -------------------------------------------------------

  const status = runInfo?.status ?? "pending";
  const runName = (runInfo?.metadata?.name as string | undefined) ?? runId;
  const statusStyle = STATUS_STYLES[status] ?? "text-white/60 bg-white/10 border-white/10";
  const isTerminal = ["completed", "failed", "cancelled", "stopped"].includes(status);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Link
          href={`/project/${projectId}/simulation`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{runName}</h1>
          <p className="text-xs text-white/40 font-mono mt-0.5 truncate">run/{runId}</p>
        </div>
        {runInfo && (
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle}`}
          >
            {status}
          </span>
        )}
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {status === "pending" && (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Run
          </button>
        )}

        {status === "running" && (
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStopping ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Stop Run
          </button>
        )}

        <button
          onClick={() => fetchRunInfo()}
          className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>

        {status === "running" && !sseConnected && (
          <button
            onClick={() => connectSse(runId)}
            className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-colors"
          >
            <Wifi className="w-3.5 h-3.5" />
            Reconnect stream
          </button>
        )}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Run details panel ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3 self-start">
          <h2 className="text-sm font-semibold text-white mb-1">Run details</h2>

          {runLoading ? (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </div>
          ) : runError ? (
            <p className="text-xs text-red-400">{runError}</p>
          ) : runInfo ? (
            <dl className="space-y-3 text-xs">
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

              {runInfo.metadata && Object.keys(runInfo.metadata).length > 0 && (
                <div>
                  <dt className="text-white/40 mb-1">Metadata</dt>
                  <dd>
                    <pre className="text-white/60 font-mono text-[11px] whitespace-pre-wrap break-all bg-black/30 rounded p-2 leading-relaxed">
                      {JSON.stringify(runInfo.metadata, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          ) : null}

          {isTerminal && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-white/40 italic">
                Run has finished. Saved metrics will appear here once the metrics API is available.
              </p>
            </div>
          )}
        </div>

        {/* ── SSE event stream panel ──────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg flex flex-col min-h-[480px]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-white">Live event stream</h2>
            <div className="flex items-center gap-3">
              {sseConnected ? (
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
                onClick={() => setEvents([])}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* SSE error banner */}
          {sseError && (
            <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {sseError}
            </div>
          )}

          {/* Event log */}
          <div
            ref={eventLogRef}
            className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-xs"
          >
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-white/25 select-none">
                <Wifi className="w-8 h-8 mb-3 opacity-30" />
                <p>
                  {status === "running"
                    ? "Stream connected — waiting for events…"
                    : "Start the run to see live events here."}
                </p>
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.uid}
                  className="flex gap-2 items-start hover:bg-white/5 rounded px-2 py-0.5 group"
                >
                  <span className="text-white/25 shrink-0 tabular-nums">
                    {ev.timestamp.slice(11, 23)}
                  </span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      EVENT_TYPE_STYLES[ev.type] ?? "bg-white/10 text-white/50"
                    }`}
                  >
                    {ev.type}
                  </span>
                  <span className="break-all text-white/70 leading-relaxed">{ev.data}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
