"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Square, Wifi, WifiOff } from "lucide-react";
import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import { startSimulationRun } from "@/lib/api-client/simulation";

// ── Types ────────────────────────────────────────────────────────────────────

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
  metrics:  "bg-sky-500/20 text-sky-300",
  error:    "bg-red-500/20 text-red-300",
  done:     "bg-emerald-500/20 text-emerald-300",
  completed:"bg-emerald-500/20 text-emerald-300",
  stopped:  "bg-gray-500/20 text-gray-300",
  best:     "bg-amber-500/20 text-amber-300",
  status:   "bg-purple-500/20 text-purple-300",
};

// ── SSE parsing helper ───────────────────────────────────────────────────────
// Strips trailing \r so the parser works correctly for both \n and \r\n
// line endings (SSE spec allows either).
function stripCr(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

// Pretty-print a string if it looks like JSON, otherwise return as-is.
function formatData(raw: string): string {
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

// ── Reusable SSE panel ───────────────────────────────────────────────────────

interface SsePanelProps {
  title: string;
  url: string;
  /** Called when a terminal event type is received so the parent can refresh run info */
  onTerminalEvent?: () => void;
  /** Called when the stream closes naturally */
  onStreamClose?: () => void;
}

function SsePanel({ title, url, onTerminalEvent, onStreamClose }: SsePanelProps) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const countRef = useRef(0);

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
        // Split on \n; stripCr handles \r\n endings
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let pending: { type?: string; data?: string; id?: string } = {};

        for (const raw of lines) {
          const line = stripCr(raw);

          if (line.startsWith("event:")) {
            pending.type = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            pending.data = (pending.data ?? "") + line.slice(5).trimStart();
          } else if (line.startsWith("id:")) {
            pending.id = line.slice(3).trim();
          } else if (line === "") {
            // Blank line = end of SSE event
            if (pending.data !== undefined) {
              countRef.current += 1;
              const eventType = pending.type ?? "message";
              setEvents((prev) => [
                ...prev.slice(-299),
                {
                  uid: pending.id ?? String(countRef.current),
                  type: eventType,
                  data: pending.data!,
                  timestamp: new Date().toISOString(),
                },
              ]);
              if (["done", "completed", "stopped", "failed"].includes(eventType)) {
                onTerminalEvent?.();
              }
            }
            pending = {};
          }
        }
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
  }, [url, onTerminalEvent, onStreamClose]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  return {
    connect,
    abort: () => abortRef.current?.abort(),
    panel: (
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
              onClick={() => setEvents([])}
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

        {/* Event log */}
        <div ref={logRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20 select-none gap-2">
              <Wifi className="w-7 h-7 opacity-30" />
              <p>{connected ? "Waiting for events…" : "Not connected."}</p>
            </div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.uid}
                className="flex gap-2 items-start hover:bg-white/5 rounded px-2 py-1 group"
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
                <pre className="break-all whitespace-pre-wrap text-white/70 leading-relaxed min-w-0">
                  {formatData(ev.data)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    ),
  };
}

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
      return data.run;
    } catch (e) {
      setRunError((e as Error).message);
      return null;
    } finally {
      setRunLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRunInfoRef.current = fetchRunInfo;
  }, [fetchRunInfo]);

  const refreshStatus = useCallback(() => {
    fetchRunInfoRef.current();
  }, []);

  // ── SSE panels ─────────────────────────────────────────────────────────────

  const simStream = SsePanel({
    title: "Simulation event stream",
    url: `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/events`,
    onTerminalEvent: refreshStatus,
    onStreamClose: refreshStatus,
  });

  const backendStream = SsePanel({
    title: "Backend / Redis event stream",
    url: `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/backend-events`,
    onTerminalEvent: refreshStatus,
    onStreamClose: refreshStatus,
  });

  // ── On mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchRunInfo().then((run) => {
      if (run?.status === "running") {
        simStream.connect();
        backendStream.connect();
      }
    });
    return () => {
      simStream.abort();
      backendStream.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startSimulationRun(runId);
      await fetchRunInfo();
      simStream.connect();
      backendStream.connect();
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
      simStream.abort();
      backendStream.abort();
      await fetchRunInfo();
    } catch (e) {
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
          <button
            onClick={handleStop}
            disabled={isStopping}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Stop Run
          </button>
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
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Run details</h2>
        {runLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : runError ? (
          <p className="text-xs text-red-400">{runError}</p>
        ) : runInfo ? (
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
              <div className="col-span-2 md:col-span-4">
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
          <p className="text-xs text-white/30 italic mt-3 pt-3 border-t border-border">
            Run has finished. Saved metrics will appear here once the metrics API is available.
          </p>
        )}
      </div>

      {/* Event stream panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {simStream.panel}
        {backendStream.panel}
      </div>
    </div>
  );
}
