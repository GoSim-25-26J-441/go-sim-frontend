"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2, Play, RefreshCw, Square, Wifi, WifiOff } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { env } from "@/lib/env";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import {
  patchRunConfiguration,
  patchRunWorkload,
  startSimulationRun,
  stopSimulationRun,
  type PatchRunConfigurationBody,
  type PatchRunConfigurationService,
  type PatchRunConfigurationWorkloadItem,
  type PatchRunConfigurationPolicies,
} from "@/lib/api-client/simulation";

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

/** Editable config for Live config panel; matches PATCH shape. */
interface LiveConfig {
  services: PatchRunConfigurationService[];
  workload: PatchRunConfigurationWorkloadItem[];
  policies?: PatchRunConfigurationPolicies;
}

function configFromStep(cfg: OptimizationStepConfig | undefined): LiveConfig | null {
  if (!cfg) return null;
  const services: PatchRunConfigurationService[] = (cfg.services ?? []).map((s) => ({
    id: s.id,
    replicas: s.replicas,
    cpu_cores: typeof (s as PatchRunConfigurationService).cpu_cores === "number" ? (s as PatchRunConfigurationService).cpu_cores : undefined,
    memory_mb: typeof (s as PatchRunConfigurationService).memory_mb === "number" ? (s as PatchRunConfigurationService).memory_mb : undefined,
  }));
  const workload: PatchRunConfigurationWorkloadItem[] = Array.isArray(cfg.workload)
    ? cfg.workload
        .filter((w): w is PatchRunConfigurationWorkloadItem => typeof w === "object" && w !== null && "pattern_key" in w && "rate_rps" in w)
        .map((w) => ({ pattern_key: w.pattern_key, rate_rps: Number(w.rate_rps) }))
    : [];
  if (services.length === 0 && workload.length === 0) return null;
  return { services, workload };
}

interface OptimizationStep {
  iteration_index: number;
  target_p95_ms: number;
  score_p95_ms: number;
  reason: string;
  previous_config?: OptimizationStepConfig;
  current_config?: OptimizationStepConfig;
}

interface Candidate {
  id: string;
  spec?: {
    vcpu?: number;
    memory_gb?: number;
    label?: string;
    [key: string]: unknown;
  };
  metrics?: {
    cpu_util_pct?: number;
    mem_util_pct?: number;
    [key: string]: unknown;
  };
  sim_workload?: {
    concurrent_users?: number;
    [key: string]: unknown;
  };
  source?: string;
  s3_path?: string;
}

interface BestCandidateHost {
  host_id: string;
  cpu_cores?: number;
  memory_gb?: number;
}

interface BestCandidateService {
  service_id: string;
  replicas?: number;
  cpu_cores?: number;
  memory_mb?: number;
}

interface BestCandidateTopology {
  s3_path?: string;
  hosts?: BestCandidateHost[];
  services?: BestCandidateService[];
}

interface CandidatesResponse {
  run_id?: string;
  user_id?: string;
  project_id?: string;
  simulation?: { nodes?: number };
  candidates: Candidate[];
  best_candidate_id?: string;
  best_candidate?: BestCandidateTopology;
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

// ── Chart types ───────────────────────────────────────────────────────────────

interface TimePoint {
  t: number;   // epoch ms
  v: number;   // request count value
}

// key = service name → rolling array of TimePoints
type ServiceSeries = Record<string, TimePoint[]>;

// Recharts needs a flat array of row objects: { t, [svcName]: value, ... }
type ChartRow = Record<string, number>;

const MAX_POINTS   = 120;  // ~2 min at 1 event/s per service
const FLUSH_MS     = 500;  // chart redraws at most every 500 ms
const LINE_COLORS  = [
  "#38bdf8", "#fb923c", "#a78bfa", "#34d399",
  "#f472b6", "#facc15", "#60a5fa", "#f87171",
];

/** Sort by timestamp and keep one point per t (latest value wins). Used so we don't mix or duplicate. */
function sortAndDedupePoints(pts: TimePoint[]): TimePoint[] {
  if (pts.length <= 1) return pts;
  const byT = new Map<number, number>();
  for (const p of pts) byT.set(p.t, p.v);
  return Array.from(byT.entries()).sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

// ── Persisted metrics types ───────────────────────────────────────────────────

interface MetricPoint {
  time: string;
  value: number;
  service_id?: string;
  node_id?: string;
  tags?: Record<string, string>;
}

interface MetricTimeseries {
  metric: string;
  points: MetricPoint[];
}

interface MetricsSummary {
  metrics?: Record<string, unknown>;
  summary_data?: Record<string, unknown>;
  total_requests?: number;
  total_errors?: number;
  total_duration_ms?: number;
  successful_requests?: number;
  failed_requests?: number;
  throughput_rps?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  latency_mean_ms?: number;
}

/** Per-service metrics from metrics_snapshot or GET /runs/{id}/metrics */
interface ServiceMetricSnapshot {
  service_name: string;
  request_count?: number;
  error_count?: number;
  concurrent_requests?: number;
  latency_p95_ms?: number;
  cpu_utilization?: number;   // 0–1 or 0–100
  memory_utilization?: number; // 0–1 or 0–100
  active_replicas?: number;
  [key: string]: unknown;
}

/** Run-level + service_metrics from SSE metrics_snapshot.data.metrics */
interface SnapshotMetrics {
  total_requests?: number;
  total_errors?: number;
  total_duration_ms?: number;
  failed_requests?: number;
  successful_requests?: number;
  throughput_rps?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  latency_mean_ms?: number;
  service_metrics?: ServiceMetricSnapshot[];
}

/** Precomputed chart rows from Web Worker (when timeseries processed off main thread) */
export type TimeseriesProcessedItem = { metric: string; rows: ChartRow[] };

interface MetricsResponse {
  run_id: string;
  summary?: MetricsSummary;
  timeseries?: MetricTimeseries[];
  /** When set, chart uses this instead of building rows from timeseries */
  timeseriesProcessed?: TimeseriesProcessedItem[];
  metrics?: { service_metrics?: ServiceMetricSnapshot[] };
}

/** Point from GET /runs/{id}/metrics/timeseries */
interface TimeseriesPoint {
  timestamp: string;
  metric: string;
  value: number;
  labels?: { service?: string; [key: string]: string | undefined };
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

// ── RequestCountChart ─────────────────────────────────────────────────────────

interface RequestCountChartProps {
  series: ServiceSeries;
  onClear: () => void;
}

function RequestCountChart({ series, onClear }: RequestCountChartProps) {
  const services = Object.keys(series);

  // Build a unified time-sorted array of rows for recharts
  const rows = useMemo<ChartRow[]>(() => {
    const tsSet = new Set<number>();
    for (const pts of Object.values(series)) pts.forEach((p) => tsSet.add(p.t));
    const sorted = Array.from(tsSet).sort((a, b) => a - b);
    return sorted.map((t) => {
      const row: ChartRow = { t };
      for (const svc of services) {
        const pt = series[svc].find((p) => p.t === t);
        if (pt !== undefined) row[svc] = pt.v;
      }
      return row;
    });
  }, [series, services]);

  // Adaptive X-axis window: infer event cadence from the data span and pick
  // a window that keeps ~60–120 ticks visible without crowding.
  // Ensure domain always has positive width to avoid Recharts duplicate tick keys.
  const xDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (rows.length < 2) return ["dataMin", "dataMax"];
    const first = rows[0].t;
    const last  = rows[rows.length - 1].t;
    const spanMs = last - first;
    const avgIntervalMs = spanMs / (rows.length - 1);

    // Window = 60× the average interval, clamped between 15 s and 3 min
    const windowMs = Math.min(
      Math.max(avgIntervalMs * 60, 15_000),
      180_000,
    );
    const start = last - windowMs;
    // Avoid zero-width domain (causes duplicate key warnings in Recharts)
    if (start >= last) return [last - 60_000, last];
    return [start, last];
  }, [rows]);

  // Y-axis: add 20 % headroom above the visible maximum so lines never hug the top
  const yMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (k !== "t" && typeof v === "number" && v > max) max = v;
      }
    }
    return max === 0 ? 10 : Math.ceil(max * 1.2);
  }, [rows]);

  // Label for the visible window shown in the header
  const windowLabel = useMemo(() => {
    if (rows.length < 2 || xDomain[0] === "dataMin") return null;
    const ms = (xDomain[1] as number) - (xDomain[0] as number);
    if (ms < 60_000) return `last ${Math.round(ms / 1000)}s`;
    return `last ${Math.round(ms / 60_000)}m`;
  }, [rows, xDomain]);

  const fmtTime = (epochMs: number) => {
    const d = new Date(epochMs);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          Request count
          <span className="ml-2 text-xs font-normal text-white/40">
            per service · cumulative · live{windowLabel ? ` · ${windowLabel}` : ""}
          </span>
        </h2>
        <button
          onClick={onClear}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Clear
        </button>
      </div>

      {services.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/20 text-xs select-none">
          Waiting for metrics…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={xDomain}
              tickFormatter={fmtTime}
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              minTickGap={60}
              tickCount={6}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a2e",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "8px",
                fontSize: "11px",
                color: "rgba(255,255,255,0.85)",
              }}
              labelFormatter={(v) => fmtTime(v as number)}
              cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", paddingTop: "8px" }}
            />
            {services.map((svc, i) => (
              <Line
                key={svc}
                type="monotone"
                dataKey={svc}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── MetricsTimeseriesChart: renders one chart per metric from persisted data ──

interface MetricsTimeseriesChartProps {
  timeseries?: MetricTimeseries[];
  /** When provided, chart uses precomputed rows (from worker); no row building on main thread */
  timeseriesProcessed?: TimeseriesProcessedItem[];
}

function MetricsTimeseriesChart({ timeseries = [], timeseriesProcessed }: MetricsTimeseriesChartProps) {
  const useProcessed = (timeseriesProcessed?.length ?? 0) > 0;
  const items = useProcessed
    ? timeseriesProcessed!
    : timeseries.map((ts) => ({
        metric: ts.metric,
        rows: (() => {
        const rowMap: Record<string, Record<string, number>> = {};
        for (const p of ts.points) {
          const key = p.time;
          if (!rowMap[key]) rowMap[key] = { _t: new Date(p.time).getTime() };
          rowMap[key][p.service_id ?? "global"] = p.value;
        }
          return Object.values(rowMap).sort((a, b) => (a._t as number) - (b._t as number));
        })(),
      }));

  if (!items.length) return (
    <p className="text-sm text-white/40 py-4 text-center">No timeseries data available.</p>
  );

  return (
    <div className="space-y-6">
      {items.map((item) => {
        const rows = item.rows;
        if (!rows.length) return null;

        const services = useProcessed
          ? Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "_t"))))
          : Array.from(new Set((timeseries!.find((ts) => ts.metric === item.metric)?.points ?? []).map((p) => p.service_id ?? "global")));

        const tMin = rows[0]._t as number;
        const tMax = rows[rows.length - 1]._t as number;
        const allVals = rows.flatMap((r) => Object.entries(r).filter(([k]) => k !== "_t").map(([, v]) => v as number));
        const vMaxRaw = Math.max(...allVals, 0) * 1.2;
        const vMax = vMaxRaw > 0 ? vMaxRaw : 1;
        const xDomainMin = tMin < tMax ? tMin : tMax - 60_000;
        const xDomainMax = tMin < tMax ? tMax : tMax;

        return (
          <div key={item.metric}>
            <p className="text-xs text-white/50 mb-2 font-mono">{item.metric}</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="_t"
                  type="number"
                  domain={[xDomainMin, xDomainMax]}
                  tickFormatter={(v: number) => new Date(v).toISOString().substring(11, 19)}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  scale="time"
                  tickCount={6}
                />
                <YAxis
                  domain={[0, vMax]}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                  width={45}
                  tickCount={5}
                />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)" }}
                  labelFormatter={(label) => typeof label === "number" ? new Date(label).toISOString() : String(label ?? "")}
                  formatter={(v, name) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), String(name ?? "")]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {services.map((svc, i) => (
                  <Line
                    key={svc}
                    dataKey={svc}
                    dot={false}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
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
  // Candidates panel
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  // Scenario YAML viewer — populated by fetchRunInfo (scenario_yaml sibling of run)
  const [scenarioYaml, setScenarioYaml] = useState<string | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  // Persisted metrics (fetched when run reaches terminal state)
  const [metricsData, setMetricsData] = useState<MetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  // Live metrics from SSE metrics_snapshot (used while run is running)
  const [liveMetricsData, setLiveMetricsData] = useState<MetricsResponse | null>(null);
  // Best-candidate topology (from same candidates API response)
  const [bestCandidate, setBestCandidate] = useState<{ best_candidate_id: string; best_candidate?: BestCandidateTopology } | null>(null);
  // Request count chart — buffer collects raw points; flushed to state at FLUSH_MS interval
  // One source per series: either metric_update or metrics_snapshot, never mixed
  const seriesSourceRef = useRef<Record<string, "metric_update" | "metrics_snapshot">>({});
  const seriesBufferRef = useRef<ServiceSeries>({});
  const knownServicesRef = useRef<Set<string>>(new Set());
  const [chartSeries, setChartSeries] = useState<ServiceSeries>({});
  // Concurrent requests (gauge): per-instance ref, per-service state for "current load" display
  const concurrentByInstanceRef = useRef<Record<string, number>>({});
  const [concurrentRequestsByService, setConcurrentRequestsByService] = useState<Record<string, number>>({});
  // Timeseries from GET .../metrics/timeseries API (for line chart over time)
  const [timeseriesApiRows, setTimeseriesApiRows] = useState<ChartRow[]>([]);
  const [timeseriesApiMetric, setTimeseriesApiMetric] = useState<string>("request_latency_ms");
  const [timeseriesApiLoading, setTimeseriesApiLoading] = useState(false);
  const [timeseriesApiError, setTimeseriesApiError] = useState<string | null>(null);
  // Live config (online mode) — editable form state; synced from optimization_step
  const [liveConfig, setLiveConfig] = useState<LiveConfig | null>(null);
  const [configUpdateLoading, setConfigUpdateLoading] = useState(false);
  const [configUpdateError, setConfigUpdateError] = useState<string | null>(null);

  const simRef = useRef<SsePanelHandle>(null);
  const fetchRunInfoRef = useRef<() => Promise<RunInfo | null>>(() => Promise.resolve(null));
  const timeseriesWorkerRef = useRef<Worker | null>(null);

  // ── Run info fetch ──────────────────────────────────────────────────────────

  const fetchRunInfo = useCallback(async (): Promise<RunInfo | null> => {
    try {
      const token = await getFirebaseIdToken();
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { run: RunInfo; scenario_yaml?: string };
      setRunInfo(data.run);
      setRunError(null);
      if (data.run.metadata?.optimization_history?.length) {
        const history = data.run.metadata.optimization_history as OptimizationStep[];
        setOptSteps(history);
        const last = history[history.length - 1];
        const fromStep = configFromStep(last?.current_config);
        if (fromStep) setLiveConfig(fromStep);
      }
      // scenario_yaml is a top-level sibling of "run" in the response
      if (data.scenario_yaml) {
        setScenarioYaml(data.scenario_yaml);
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
    // Seed timeline and live config from persisted optimization_history (present on load / reload)
    if (run.metadata?.optimization_history?.length) {
      const history = run.metadata.optimization_history as OptimizationStep[];
      setOptSteps(history);
      const last = history[history.length - 1];
      const fromStep = configFromStep(last?.current_config);
      if (fromStep) setLiveConfig(fromStep);
    }
  }, []);

  // Handle individual SSE events that need page-level processing
  const handleSseEvent = useCallback((type: string, data: string) => {
    if (type === "optimization_step") {
      try {
        const payload = JSON.parse(data) as { data?: OptimizationStep };
        const step = payload.data;
        if (step && step.iteration_index != null) {
          setOptSteps((prev) => {
            const exists = prev.some((s) => s.iteration_index === step.iteration_index);
            return exists ? prev : [...prev, step];
          });
          const fromStep = configFromStep(step.current_config);
          if (fromStep) setLiveConfig(fromStep);
        }
      } catch { /* malformed — ignore */ }
    }

    if (type === "metric_update") {
      try {
        interface MetricPayload {
          metric?: string;
          value?: number;
          timestamp?: string;
          labels?: { service?: string; instance?: string; endpoint?: string; [key: string]: unknown };
          service_id?: string;
          service_name?: string;
        }
        const outer = JSON.parse(data) as MetricPayload & { data?: MetricPayload };
        // Backend wraps the metric inside a "data" field: { data: {...}, event, run_id }
        // Fall back to flat format for older/direct payloads.
        const m: MetricPayload = outer.data ?? outer;
        const svc = (m.labels?.service ?? m.service_id ?? m.service_name) as string | undefined;
        if (svc) knownServicesRef.current.add(svc);

        // request_count: one source per series (metric_update or metrics_snapshot, never mixed)
        if (m.metric === "request_count" && svc && m.value != null && seriesSourceRef.current[svc] !== "metrics_snapshot") {
          seriesSourceRef.current[svc] = "metric_update";
          const t = m.timestamp ? new Date(m.timestamp).getTime() : Date.now();
          const pt: TimePoint = { t, v: m.value }; // value is already cumulative, no accumulation
          const buf = seriesBufferRef.current;
          if (!buf[svc]) buf[svc] = [];
          buf[svc].push(pt);
          if (buf[svc].length > MAX_POINTS) buf[svc] = buf[svc].slice(-MAX_POINTS);
        }

        // Gauges: use latest value directly (no accumulation)
        if (m.metric === "concurrent_requests" && svc && m.value != null) {
          const instance = (m.labels?.instance as string) ?? "default";
          const key = `${svc}::${instance}`;
          concurrentByInstanceRef.current[key] = m.value;
          // Recompute per-service aggregate (sum of latest per instance)
          const bySvc: Record<string, number> = {};
          for (const [k, v] of Object.entries(concurrentByInstanceRef.current)) {
            const s = k.split("::")[0];
            bySvc[s] = (bySvc[s] ?? 0) + v;
          }
          setConcurrentRequestsByService(bySvc);
        }
      } catch { /* malformed — ignore */ }
    }

    const pushRequestCountFromServiceMetrics = (list: ServiceMetricSnapshot[]) => {
      if (!Array.isArray(list) || list.length === 0) return;
      const t = Date.now();
      for (const sm of list) {
        const name = sm?.service_name;
        if (name != null && typeof sm.request_count === "number") {
          if (seriesSourceRef.current[name] === "metric_update") continue; // already using metric_update for this service
          seriesSourceRef.current[name] = "metrics_snapshot";
          knownServicesRef.current.add(name);
          const buf = seriesBufferRef.current;
          if (!buf[name]) buf[name] = [];
          buf[name].push({ t, v: sm.request_count }); // total_requests / request_count already cumulative
          if (buf[name].length > MAX_POINTS) buf[name] = buf[name].slice(-MAX_POINTS);
        }
      }
    };

    if (type === "metrics_snapshot" || type === "metrics") {
      try {
        const parsed = JSON.parse(data) as {
          data?: { metrics?: SnapshotMetrics };
          metrics?: SnapshotMetrics;
        };
        const metrics = parsed.data?.metrics ?? parsed.metrics;
        if (!metrics || typeof metrics !== "object") return;

        const list = metrics.service_metrics;
        if (Array.isArray(list) && list.length > 0) {
          // Gauges (concurrent_requests, cpu_utilization, etc.): use latest value directly
          const bySvc: Record<string, number> = {};
          for (const sm of list) {
            const name = sm?.service_name;
            if (name != null && typeof sm.concurrent_requests === "number") {
              bySvc[name] = sm.concurrent_requests;
            }
          }
          if (Object.keys(bySvc).length > 0) {
            setConcurrentRequestsByService((prev) => ({ ...prev, ...bySvc }));
          }
          pushRequestCountFromServiceMetrics(list);
        }

        const num = (v: unknown): number | undefined =>
          typeof v === "number" && Number.isFinite(v) ? v : undefined;
        const totalRequests = num(metrics.total_requests);
        if (totalRequests == null && !list?.length) return;

        const summary: MetricsSummary = {
          total_requests: totalRequests ?? undefined,
          total_errors: num(metrics.total_errors) ?? num(metrics.failed_requests),
          total_duration_ms: num(metrics.total_duration_ms),
          successful_requests: num(metrics.successful_requests),
          failed_requests: num(metrics.failed_requests),
          throughput_rps: num(metrics.throughput_rps),
          latency_p50_ms: num(metrics.latency_p50_ms),
          latency_p95_ms: num(metrics.latency_p95_ms),
          latency_p99_ms: num(metrics.latency_p99_ms),
          latency_mean_ms: num(metrics.latency_mean_ms),
        };
        setLiveMetricsData({
          run_id: runId,
          summary,
          metrics: Array.isArray(list) && list.length > 0 ? { service_metrics: list } : undefined,
        });
      } catch { /* malformed — ignore */ }
    }
  }, [runId]);

  // Fallback: re-fetch from API (used on stream close / legacy terminal events)
  const refreshStatus = useCallback(() => { fetchRunInfoRef.current(); }, []);

  // ── Candidates fetch ─────────────────────────────────────────────────────────

  const fetchCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const token = await getFirebaseIdToken();
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/candidates`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CandidatesResponse;
      setCandidates(data.candidates ?? []);
      setBestCandidate({
        best_candidate_id: data.best_candidate_id ?? "",
        best_candidate: data.best_candidate,
      });
    } catch (e) {
      setCandidatesError((e as Error).message);
    } finally {
      setCandidatesLoading(false);
    }
  }, [runId]);

  // ── Scenario YAML — loaded from the main run fetch (scenario_yaml sibling of run) ──

  const handleScenarioToggle = useCallback(() => {
    setScenarioOpen((prev) => !prev);
  }, []);

  // ── Persisted metrics fetch ───────────────────────────────────────────────────

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const token = await getFirebaseIdToken();
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/metrics`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) {
        setMetricsData({ run_id: runId, timeseries: [] });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MetricsResponse & Record<string, unknown>;
      // Normalize summary from multiple possible backend shapes so KPI cards always have values
      const raw = data.summary ?? {};
      const fromSummaryMetrics =
        raw && typeof raw === "object" && "metrics" in raw && raw.metrics && typeof raw.metrics === "object"
          ? (raw.metrics as Record<string, unknown>)
          : {};
      const fromSummaryData =
        raw && typeof raw === "object" && "summary_data" in raw && raw.summary_data && typeof raw.summary_data === "object"
          ? (raw.summary_data as Record<string, unknown>)
          : {};
      const fromTopLevel = data as Record<string, unknown>;
      const num = (v: unknown): number | undefined =>
        typeof v === "number" && Number.isFinite(v) ? v : undefined;
      const summary: MetricsSummary = {
        ...raw,
        total_requests:
          num(fromSummaryMetrics.total_requests) ??
          num(raw.total_requests) ??
          num(fromSummaryData.total_requests) ??
          num(fromTopLevel.total_requests),
        total_errors:
          num(fromSummaryMetrics.total_errors) ??
          num(fromSummaryMetrics.failed_requests) ??
          num(raw.total_errors) ??
          num(fromSummaryData.total_errors) ??
          num(fromTopLevel.total_errors),
        total_duration_ms:
          num(fromSummaryMetrics.total_duration_ms) ??
          num(raw.total_duration_ms) ??
          num(fromSummaryData.total_duration_ms) ??
          num(fromTopLevel.total_duration_ms),
        successful_requests:
          num(fromSummaryMetrics.successful_requests) ??
          num(raw.successful_requests) ??
          num(fromSummaryData.successful_requests) ??
          num(fromTopLevel.successful_requests),
        failed_requests:
          num(fromSummaryMetrics.failed_requests) ??
          num(raw.failed_requests) ??
          num(fromSummaryData.failed_requests) ??
          num(fromTopLevel.failed_requests),
        throughput_rps:
          num(fromSummaryMetrics.throughput_rps) ??
          num(raw.throughput_rps) ??
          num(fromSummaryData.throughput_rps) ??
          num(fromSummaryData.avg_rps) ??
          num(fromTopLevel.throughput_rps) ??
          num(fromTopLevel.avg_rps),
        latency_p50_ms:
          num(fromSummaryMetrics.latency_p50_ms) ??
          num(raw.latency_p50_ms) ??
          num(fromSummaryData.latency_p50_ms) ??
          num(fromTopLevel.latency_p50_ms),
        latency_p95_ms:
          num(fromSummaryMetrics.latency_p95_ms) ??
          num(raw.latency_p95_ms) ??
          num(fromSummaryData.latency_p95_ms) ??
          num(fromSummaryData.p95_latency_ms) ??
          num(fromTopLevel.latency_p95_ms) ??
          num(fromTopLevel.p95_latency_ms),
        latency_p99_ms:
          num(fromSummaryMetrics.latency_p99_ms) ??
          num(raw.latency_p99_ms) ??
          num(fromSummaryData.latency_p99_ms) ??
          num(fromSummaryData.p99_latency_ms) ??
          num(fromTopLevel.latency_p99_ms) ??
          num(fromTopLevel.p99_latency_ms),
        latency_mean_ms:
          num(fromSummaryMetrics.latency_mean_ms) ??
          num(raw.latency_mean_ms) ??
          num(fromSummaryData.latency_mean_ms) ??
          num(fromSummaryData.avg_latency_ms) ??
          num(fromTopLevel.latency_mean_ms) ??
          num(fromTopLevel.avg_latency_ms),
      };
      const serviceMetrics =
        data.metrics?.service_metrics ??
        (Array.isArray(fromSummaryMetrics.service_metrics) ? fromSummaryMetrics.service_metrics : undefined);
      const metricsPayload =
        serviceMetrics != null ? { ...data.metrics, service_metrics: serviceMetrics } : data.metrics;

      if (data.timeseries && data.timeseries.length > 0 && typeof Worker !== "undefined") {
        let worker: Worker | null = timeseriesWorkerRef.current;
        if (!worker) {
          try {
            worker = new Worker(
              new URL("../../../../../../workers/timeseries-processor.worker.ts", import.meta.url),
              { type: "module" }
            );
            timeseriesWorkerRef.current = worker;
          } catch {
            worker = null;
          }
        }
        if (worker) {
          try {
            const timeseriesProcessed = await new Promise<TimeseriesProcessedItem[]>((resolve, reject) => {
              const onMsg = (e: MessageEvent<{ type: string; timeseriesProcessed?: TimeseriesProcessedItem[]; error?: string }>) => {
                worker!.removeEventListener("message", onMsg);
                worker!.removeEventListener("error", onErr);
                if (e.data?.type === "metricsResult" && Array.isArray(e.data.timeseriesProcessed)) resolve(e.data.timeseriesProcessed);
                else if (e.data?.type === "error") reject(new Error(e.data.error ?? "Worker error"));
                else reject(new Error("Unknown worker response"));
              };
              const onErr = () => {
                worker!.removeEventListener("message", onMsg);
                worker!.removeEventListener("error", onErr);
                reject(new Error("Worker error"));
              };
              worker.addEventListener("message", onMsg);
              worker.addEventListener("error", onErr);
              worker.postMessage({ type: "processMetrics", data });
            });
            setMetricsData({ ...data, summary, metrics: metricsPayload, timeseries: undefined, timeseriesProcessed });
            if (serviceMetrics?.length) {
              const bySvc: Record<string, number> = {};
              for (const sm of serviceMetrics) {
                if (sm.service_name != null && typeof sm.concurrent_requests === "number") {
                  bySvc[sm.service_name] = sm.concurrent_requests;
                }
              }
              if (Object.keys(bySvc).length > 0) {
                setConcurrentRequestsByService((prev) => ({ ...prev, ...bySvc }));
              }
            }
            return;
          } catch {
            // fall back to main-thread path below
          }
        }
      }

      setMetricsData({ ...data, summary, metrics: metricsPayload });
      if (serviceMetrics?.length) {
        const bySvc: Record<string, number> = {};
        for (const sm of serviceMetrics) {
          if (sm.service_name != null && typeof sm.concurrent_requests === "number") {
            bySvc[sm.service_name] = sm.concurrent_requests;
          }
        }
        if (Object.keys(bySvc).length > 0) {
          setConcurrentRequestsByService((prev) => ({ ...prev, ...bySvc }));
        }
        // Fallback: seed Request count chart from persisted metrics when chart has no data
        const hasRequestCount = serviceMetrics.some(
          (sm) => sm.service_name != null && typeof sm.request_count === "number"
        );
        if (hasRequestCount) {
          const t = Date.now();
          setChartSeries((prev) => {
            const hasPoints = Object.values(prev).some((pts) => pts.length > 0);
            if (hasPoints) return prev;
            const next: ServiceSeries = {};
            for (const sm of serviceMetrics) {
              if (sm.service_name != null && typeof sm.request_count === "number") {
                next[sm.service_name] = [{ t, v: sm.request_count }];
                seriesSourceRef.current[sm.service_name] = "metrics_snapshot";
              }
            }
            return Object.keys(next).length > 0 ? next : prev;
          });
        }
      }
    } catch (e) {
      setMetricsError((e as Error).message);
    } finally {
      setMetricsLoading(false);
    }
  }, [runId]);

  const TIMESERIES_WORKER_THRESHOLD = 500;

  // Fetch timeseries from GET .../metrics/timeseries (metric, optional service, start_time, end_time)
  const fetchTimeseriesApi = useCallback(async () => {
    setTimeseriesApiLoading(true);
    setTimeseriesApiError(null);
    try {
      const token = await getFirebaseIdToken();
      const params = new URLSearchParams({ metric: timeseriesApiMetric });
      const url = `${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/metrics/timeseries?${params}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { points?: TimeseriesPoint[] };
      const points = data.points ?? [];

      if (points.length > TIMESERIES_WORKER_THRESHOLD && typeof Worker !== "undefined") {
        let worker: Worker | null = timeseriesWorkerRef.current;
        if (!worker) {
          try {
            worker = new Worker(
              new URL("../../../../../../workers/timeseries-processor.worker.ts", import.meta.url),
              { type: "module" }
            );
            timeseriesWorkerRef.current = worker;
          } catch {
            worker = null;
          }
        }
        if (worker) {
          try {
            const rows = await new Promise<ChartRow[]>((resolve, reject) => {
              const onMsg = (e: MessageEvent<{ type: string; rows?: ChartRow[]; error?: string }>) => {
                worker!.removeEventListener("message", onMsg);
                worker!.removeEventListener("error", onErr);
                if (e.data?.type === "timeseriesResult" && Array.isArray(e.data.rows)) resolve(e.data.rows);
                else if (e.data?.type === "error") reject(new Error(e.data.error ?? "Worker error"));
                else reject(new Error("Unknown worker response"));
              };
              const onErr = () => {
                worker!.removeEventListener("message", onMsg);
                worker!.removeEventListener("error", onErr);
                reject(new Error("Worker error"));
              };
              worker.addEventListener("message", onMsg);
              worker.addEventListener("error", onErr);
              worker.postMessage({ type: "processTimeseriesPoints", points });
            });
            setTimeseriesApiRows(rows);
            setTimeseriesApiLoading(false);
            return;
          } catch {
            // fall back to main-thread row building below
          }
        }
      }

      const rowMap: Record<number, Record<string, number>> = {};
      for (const p of points) {
        const t = typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : Number(p.timestamp);
        if (!rowMap[t]) rowMap[t] = { _t: t };
        const service = p.labels?.service ?? "global";
        rowMap[t][service] = p.value;
      }
      const rows: ChartRow[] = Object.values(rowMap).sort((a, b) => (a._t as number) - (b._t as number));
      setTimeseriesApiRows(rows);
    } catch (e) {
      setTimeseriesApiError((e as Error).message);
      setTimeseriesApiRows([]);
    } finally {
      setTimeseriesApiLoading(false);
    }
  }, [runId, timeseriesApiMetric]);

  // Clear chart data and concurrent-requests state
  const clearChart = useCallback(() => {
    seriesSourceRef.current = {};
    seriesBufferRef.current = {};
    knownServicesRef.current.clear();
    setChartSeries({});
    concurrentByInstanceRef.current = {};
    setConcurrentRequestsByService({});
  }, []);

  // Terminate timeseries worker on unmount or runId change to avoid leaks
  useEffect(() => {
    return () => {
      if (timeseriesWorkerRef.current) {
        timeseriesWorkerRef.current.terminate();
        timeseriesWorkerRef.current = null;
      }
    };
  }, [runId]);

  // ── On mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchRunInfo().then((run) => {
      if (run?.status === "running") {
        simRef.current?.connect();
      }
    });

    // Flush buffer → chart state at FLUSH_MS cadence
    const flushId = setInterval(() => {
      const buf = seriesBufferRef.current;
      if (Object.keys(buf).length > 0 || knownServicesRef.current.size > 0) {
        setChartSeries((prev) => {
          const next = { ...prev };
          for (const [svc, pts] of Object.entries(buf)) {
            const existing = next[svc] ?? [];
            const merged = sortAndDedupePoints([...existing, ...pts]).slice(-MAX_POINTS);
            next[svc] = merged;
          }
          for (const svc of knownServicesRef.current) {
            if (!(svc in next)) next[svc] = prev[svc] ?? [];
          }
          // Clear consumed points from buffer
          seriesBufferRef.current = {};
          return next;
        });
      }
    }, FLUSH_MS);

    return () => {
      simRef.current?.abort();
      clearInterval(flushId);
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

  // ── Live config apply (online mode) ─────────────────────────────────────────

  const applyServices = useCallback(async () => {
    if (!liveConfig?.services?.length) return;
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      await patchRunConfiguration(runId, { services: liveConfig.services });
    } catch (e) {
      setConfigUpdateError((e as Error).message);
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig?.services]);

  const applyWorkload = useCallback(async () => {
    if (!liveConfig?.workload?.length) return;
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      if (liveConfig.workload.length === 1) {
        const { pattern_key, rate_rps } = liveConfig.workload[0];
        if (rate_rps <= 0) {
          setConfigUpdateError("rate_rps must be greater than 0");
          return;
        }
        await patchRunWorkload(runId, { pattern_key, rate_rps });
      } else {
        const invalid = liveConfig.workload.find((w) => w.rate_rps <= 0);
        if (invalid) {
          setConfigUpdateError("All rate_rps must be greater than 0");
          return;
        }
        await patchRunConfiguration(runId, { workload: liveConfig.workload });
      }
    } catch (e) {
      setConfigUpdateError((e as Error).message);
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig?.workload]);

  const applyPolicies = useCallback(async () => {
    if (!liveConfig) return;
    const policies = liveConfig.policies ?? { autoscaling: { enabled: false, target_cpu_util: 70, scale_step: 1 } };
    if (!policies.autoscaling) return;
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      await patchRunConfiguration(runId, { policies });
    } catch (e) {
      setConfigUpdateError((e as Error).message);
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const status = runInfo?.status ?? "pending";
  const runName = (runInfo?.metadata?.name as string | undefined) ?? runId;
  const statusStyle = STATUS_STYLES[status] ?? "text-white/60 bg-white/10 border-white/10";
  const isTerminal = ["completed", "failed", "cancelled", "stopped"].includes(status);
  const isOnlineMode =
    status === "running" &&
    (runInfo?.metadata?.mode === "online" || runInfo?.metadata?.mode === "online_optimization");
  const showMetricsSection = (status === "running" && liveMetricsData) || isTerminal;
  const displayMetrics = status === "running" && liveMetricsData ? liveMetricsData : metricsData;

  // Auto-fetch persisted metrics + candidates (includes best-candidate) once the run is terminal
  useEffect(() => {
    if (isTerminal && !metricsData && !metricsLoading) fetchMetrics();
    if (isTerminal && candidates === null && !candidatesLoading) fetchCandidates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal]);

  // Clear live metrics when run becomes terminal or runId changes (so UI uses persisted data / fresh run)
  useEffect(() => {
    if (isTerminal) setLiveMetricsData(null);
  }, [isTerminal]);
  useEffect(() => {
    setLiveMetricsData(null);
  }, [runId]);

  // Clear live config when run leaves online mode or runId changes
  useEffect(() => {
    if (!isOnlineMode) setLiveConfig(null);
  }, [isOnlineMode]);
  useEffect(() => {
    setLiveConfig(null);
    setConfigUpdateError(null);
  }, [runId]);

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

        {isTerminal && (
          <Link
            href={`/project/${projectId}/cost/suggest?run_id=${runId}`}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Go to analysis
          </Link>
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
                          ? (runInfo.metadata.objective === "cpu_utilization" ||
                            runInfo.metadata.objective === "memory_utilization")
                            ? `${(runInfo.metadata.best_score * 100).toFixed(2)}%`
                            : runInfo.metadata.best_score.toFixed(4)
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

      {/* Live config — online mode only, realtime PATCH configuration / workload */}
      {isOnlineMode && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-white">Live config</h2>
          {configUpdateError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {configUpdateError}
            </p>
          )}

          {!liveConfig ? (
            <p className="text-xs text-white/40 italic">
              No configuration data yet. Configuration will appear after the first optimization step.
            </p>
          ) : (
            <>
              {/* Services */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Services</h3>
                  <button
                    type="button"
                    onClick={applyServices}
                    disabled={configUpdateLoading || !liveConfig.services.length}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {configUpdateLoading ? "Applying…" : "Apply services"}
                  </button>
                </div>
                {liveConfig.services.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No services in config.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border bg-white/5 text-white/40 text-left">
                          <th className="px-3 py-2 font-medium">Service ID</th>
                          <th className="px-3 py-2 font-medium">Replicas</th>
                          <th className="px-3 py-2 font-medium">CPU cores</th>
                          <th className="px-3 py-2 font-medium">Mem (MB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveConfig.services.map((s, i) => (
                          <tr key={`${s.id}-${i}`} className="border-b border-border/50">
                            <td className="px-3 py-2 text-white/80">{s.id}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={s.replicas ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                                  setLiveConfig((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          services: prev.services.map((svc, j) =>
                                            j === i ? { ...svc, replicas: Number.isFinite(v) ? v : undefined } : svc
                                          ),
                                        }
                                      : prev
                                  );
                                }}
                                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={s.cpu_cores ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                  setLiveConfig((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          services: prev.services.map((svc, j) =>
                                            j === i ? { ...svc, cpu_cores: Number.isFinite(v) ? v : undefined } : svc
                                          ),
                                        }
                                      : prev
                                  );
                                }}
                                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={s.memory_mb ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                  setLiveConfig((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          services: prev.services.map((svc, j) =>
                                            j === i ? { ...svc, memory_mb: Number.isFinite(v) ? v : undefined } : svc
                                          ),
                                        }
                                      : prev
                                  );
                                }}
                                className="w-20 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Workload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Workload</h3>
                  <button
                    type="button"
                    onClick={applyWorkload}
                    disabled={configUpdateLoading || !liveConfig.workload.length}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {configUpdateLoading ? "Applying…" : "Apply workload"}
                  </button>
                </div>
                {liveConfig.workload.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No workload patterns in config.</p>
                ) : (
                  <div className="space-y-2">
                    {liveConfig.workload.map((w, i) => (
                      <div key={`${w.pattern_key}-${i}`} className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-mono text-white/60 w-32 truncate" title={w.pattern_key}>
                          {w.pattern_key}
                        </span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.1}
                          value={w.rate_rps}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setLiveConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    workload: prev.workload.map((item, j) =>
                                      j === i ? { ...item, rate_rps: Number.isFinite(v) ? v : 0 } : item
                                    ),
                                  }
                                : prev
                            );
                          }}
                          className="w-24 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                          placeholder="RPS"
                        />
                        <span className="text-xs text-white/40">RPS</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Policies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Policies</h3>
                  <button
                    type="button"
                    onClick={applyPolicies}
                    disabled={configUpdateLoading}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {configUpdateLoading ? "Applying…" : "Apply policies"}
                  </button>
                </div>
                {(() => {
                  const autoscaling = liveConfig.policies?.autoscaling ?? {
                    enabled: false,
                    target_cpu_util: 70,
                    scale_step: 1,
                  };
                  return (
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-white/70">
                        <input
                          type="checkbox"
                          checked={autoscaling.enabled}
                          onChange={(e) =>
                            setLiveConfig((prev) => ({
                              ...prev!,
                              policies: {
                                autoscaling: {
                                  ...(prev?.policies?.autoscaling ?? {
                                    enabled: false,
                                    target_cpu_util: 70,
                                    scale_step: 1,
                                  }),
                                  enabled: e.target.checked,
                                },
                              },
                            }))
                          }
                          className="rounded border-white/20"
                        />
                        Autoscaling enabled
                      </label>
                      <label className="flex items-center gap-2 text-xs text-white/70">
                        Target CPU %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={autoscaling.target_cpu_util ?? 70}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setLiveConfig((prev) => ({
                              ...prev!,
                              policies: {
                                autoscaling: {
                                  ...(prev?.policies?.autoscaling ?? {
                                    enabled: false,
                                    target_cpu_util: 70,
                                    scale_step: 1,
                                  }),
                                  target_cpu_util: Number.isFinite(v) ? v : 70,
                                },
                              },
                            }));
                          }}
                          className="w-16 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-white/70">
                        Scale step
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={autoscaling.scale_step ?? 1}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setLiveConfig((prev) => ({
                              ...prev!,
                              policies: {
                                autoscaling: {
                                  ...(prev?.policies?.autoscaling ?? {
                                    enabled: false,
                                    target_cpu_util: 70,
                                    scale_step: 1,
                                  }),
                                  scale_step: Number.isFinite(v) && v >= 1 ? v : 1,
                                },
                              },
                            }));
                          }}
                          className="w-16 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                        />
                      </label>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Scenario YAML viewer — data comes from the main run fetch */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Header — always visible, acts as toggle */}
        <button
          onClick={handleScenarioToggle}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
        >
          <span className="text-sm font-semibold text-white">Scenario YAML</span>
          <div className="flex items-center gap-3">
            {scenarioYaml && (
              <span className="text-xs text-white/30">
                {scenarioYaml.split("\n").length} lines
              </span>
            )}
            {runLoading && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white/40" />
            )}
            <span className="text-white/30 text-xs">{scenarioOpen ? "▲" : "▼"}</span>
          </div>
        </button>

        {scenarioOpen && (
          <div className="border-t border-border">
            {scenarioYaml ? (
              <div className="relative">
                {/* Toolbar */}
                <div className="flex items-center justify-end gap-3 px-4 py-2 border-b border-border bg-black/20">
                  <button
                    onClick={() => fetchRunInfo()}
                    className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
                    title="Refresh (re-fetches run)"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(scenarioYaml)}
                    className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
                <pre className="p-4 font-mono text-[11px] text-emerald-300/80 leading-relaxed whitespace-pre overflow-x-auto bg-black/30 max-h-[500px]">
                  {scenarioYaml}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs text-white/30 italic">
                  Scenario YAML not available for this run yet.
                </p>
                <button
                  onClick={() => fetchRunInfo()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current load (concurrent_requests) — shown when we have at least one value */}
      {Object.keys(concurrentRequestsByService).length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">
            Concurrent requests
            <span className="ml-2 text-xs font-normal text-white/40">current load per service</span>
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(concurrentRequestsByService).map(([svc, count]) => (
              <div
                key={svc}
                className="rounded-lg border border-border bg-black/20 px-3 py-2 flex items-center gap-2"
              >
                <span className="text-xs text-white/60 truncate max-w-[120px]" title={svc}>{svc}</span>
                <span className="text-sm font-mono font-semibold text-white tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request count chart */}
      <RequestCountChart series={chartSeries} onClear={clearChart} />

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

      {/* Candidates panel */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Candidates
            {candidates !== null && (
              <span className="ml-2 text-xs font-normal text-white/40">
                {candidates.length} record{candidates.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <button
            onClick={fetchCandidates}
            disabled={candidatesLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${candidatesLoading ? "animate-spin" : ""}`} />
            {candidates === null ? "Fetch candidates" : "Refresh"}
          </button>
        </div>

        {candidatesError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {candidatesError}
          </p>
        )}

        {candidates === null && !candidatesLoading && !candidatesError && (
          <p className="text-xs text-white/30 italic">
            Click "Fetch candidates" to load candidates for this run.
          </p>
        )}

        {candidatesLoading && (
          <div className="flex items-center gap-2 text-xs text-white/50 py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}

        {candidates !== null && candidates.length === 0 && !candidatesLoading && (
          <p className="text-xs text-white/30 italic">
            No candidates recorded for this run.
          </p>
        )}

        {candidates !== null && candidates.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-white/5 text-white/40 text-left">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">vCPU</th>
                  <th className="px-3 py-2 font-medium">Mem (GB)</th>
                  <th className="px-3 py-2 font-medium">CPU util %</th>
                  <th className="px-3 py-2 font-medium">Mem util %</th>
                  <th className="px-3 py-2 font-medium">Conc. users</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">YAML</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const isExpanded = expandedCandidate === c.id;
                  const isBest = bestCandidate?.best_candidate_id && c.id === bestCandidate.best_candidate_id;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className={`border-b border-border/50 hover:bg-white/5 transition-colors ${isBest ? "bg-amber-500/5" : ""}`}
                      >
                        <td className="px-3 py-2 text-white/80">
                          {c.id}
                          {isBest && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300">
                              Best
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-white/70">{c.spec?.vcpu ?? "—"}</td>
                        <td className="px-3 py-2 text-white/70">{c.spec?.memory_gb ?? "—"}</td>
                        <td className="px-3 py-2">
                          {c.metrics?.cpu_util_pct != null ? (
                            <span className={c.metrics.cpu_util_pct > 80 ? "text-red-400" : "text-white/70"}>
                              {c.metrics.cpu_util_pct}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {c.metrics?.mem_util_pct != null ? (
                            <span className={c.metrics.mem_util_pct > 80 ? "text-red-400" : "text-white/70"}>
                              {c.metrics.mem_util_pct}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-white/70">
                          {c.sim_workload?.concurrent_users ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-white/40 truncate max-w-[140px]" title={c.source}>
                          {c.source ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {c.s3_path ? (
                            <a
                              href={`${env.BACKEND_BASE}/api/v1/simulation/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(c.id)}/yaml`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400/70 hover:text-sky-400 transition-colors text-[11px] font-normal"
                              title={c.s3_path}
                            >
                              YAML ↗
                            </a>
                          ) : (
                            <span className="text-white/20">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setExpandedCandidate(isExpanded ? null : c.id)}
                            className="text-white/30 hover:text-white/70 transition-colors"
                            title={isExpanded ? "Collapse" : "Expand details"}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-border/50 bg-black/20">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Spec</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(c.spec ?? {}, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Metrics</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(c.metrics ?? {}, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Sim workload</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(c.sim_workload ?? {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metrics — live from stream when running, persisted when terminal */}
      {showMetricsSection && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Metrics
              {status === "running" && liveMetricsData && (
                <span className="ml-2 text-xs font-normal text-emerald-400">Live</span>
              )}
              {displayMetrics?.summary?.total_requests != null && (
                <span className="ml-2 text-xs font-normal text-white/40">
                  {displayMetrics.summary.total_requests.toLocaleString()} requests
                </span>
              )}
            </h2>
            {isTerminal && (
            <button
              onClick={fetchMetrics}
              disabled={metricsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${metricsLoading ? "animate-spin" : ""}`} />
              {metricsData === null ? "Load metrics" : "Refresh"}
            </button>
            )}
          </div>

          {metricsError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {metricsError}
            </p>
          )}

          {isTerminal && metricsLoading && (
            <div className="flex items-center gap-2 text-xs text-white/50 py-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading metrics…
            </div>
          )}

          {displayMetrics && !(isTerminal && metricsLoading) && (
            <>
              {/* Summary stats / KPI cards */}
              {displayMetrics.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Total requests</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.total_requests?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Total errors</p>
                    <p className={`text-lg font-mono font-semibold ${(displayMetrics.summary.total_errors ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {displayMetrics.summary.total_errors?.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Duration</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.total_duration_ms != null
                        ? `${(displayMetrics.summary.total_duration_ms / 1000).toFixed(1)}s`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Successful requests</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.successful_requests?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Failed requests</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.failed_requests?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Throughput (RPS)</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.throughput_rps != null ? displayMetrics.summary.throughput_rps.toFixed(1) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Latency P50 (ms)</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.latency_p50_ms != null ? displayMetrics.summary.latency_p50_ms.toFixed(0) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Latency P95 (ms)</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.latency_p95_ms != null ? displayMetrics.summary.latency_p95_ms.toFixed(0) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Latency P99 (ms)</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.latency_p99_ms != null ? displayMetrics.summary.latency_p99_ms.toFixed(0) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-black/20 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Latency mean (ms)</p>
                    <p className="text-lg font-mono font-semibold text-white">
                      {displayMetrics.summary.latency_mean_ms != null ? displayMetrics.summary.latency_mean_ms.toFixed(0) : "—"}
                    </p>
                  </div>
                </div>
              )}

              {/* Error rate / Success vs failure */}
              {displayMetrics.summary && (() => {
                const s = displayMetrics.summary;
                const success = s.successful_requests ?? (s.total_requests != null && s.total_errors != null ? s.total_requests - s.total_errors : null);
                const failed = s.failed_requests ?? s.total_errors ?? null;
                const total = s.total_requests ?? (success != null && failed != null ? success + failed : null);
                const errorRatePct = total != null && total > 0 && failed != null ? (failed / total) * 100 : null;
                const hasDonut = (success != null && success > 0) || (failed != null && failed > 0);
                if (errorRatePct == null && !hasDonut) return null;
                const donutData = [
                  ...(success != null && success > 0 ? [{ name: "Success", value: success, color: "#34d399" }] : []),
                  ...(failed != null && failed > 0 ? [{ name: "Failed", value: failed, color: "#f87171" }] : []),
                ];
                return (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Success vs failure</h3>
                    <div className="flex flex-wrap items-center gap-4">
                      {errorRatePct != null && (
                        <div className="rounded-lg border border-border bg-black/20 p-3 text-center min-w-[100px]">
                          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Error rate</p>
                          <p className={`text-lg font-mono font-semibold ${errorRatePct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {errorRatePct.toFixed(1)}%
                          </p>
                        </div>
                      )}
                      {donutData.length > 0 && (
                        <div className="rounded-lg border border-border bg-black/20 p-2 flex items-center gap-2">
                          <ResponsiveContainer width={80} height={80}>
                            <PieChart>
                              <Pie
                                data={donutData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={24}
                                outerRadius={36}
                                paddingAngle={0}
                                stroke="none"
                              >
                                {donutData.map((entry, i) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: "rgb(15 23 42)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8 }}
                                formatter={(v, name) => [typeof v === "number" ? v.toLocaleString() : String(v ?? ""), String(name ?? "")]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="text-xs text-white/70">
                            {success != null && <span className="text-emerald-400">{success.toLocaleString()} success</span>}
                            {success != null && failed != null && failed > 0 && " · "}
                            {failed != null && failed > 0 && <span className="text-red-400">{failed.toLocaleString()} failed</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Per-service comparison table */}
              {displayMetrics.metrics?.service_metrics && displayMetrics.metrics.service_metrics.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Per-service metrics</h3>
                  <div className="rounded-lg border border-border bg-black/20 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-white/50">
                          <th className="px-3 py-2 font-medium">Service</th>
                          <th className="px-3 py-2 font-medium text-right">Requests</th>
                          <th className="px-3 py-2 font-medium text-right">Errors</th>
                          <th className="px-3 py-2 font-medium text-right">Latency P95 (ms)</th>
                          <th className="px-3 py-2 font-medium text-right">CPU %</th>
                          <th className="px-3 py-2 font-medium text-right">Memory %</th>
                          <th className="px-3 py-2 font-medium text-right">Concurrent</th>
                          <th className="px-3 py-2 font-medium text-right">Replicas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayMetrics.metrics.service_metrics.map((sm) => {
                          const cpu = sm.cpu_utilization;
                          const mem = sm.memory_utilization;
                          const cpuVal = typeof cpu === "number" ? (cpu <= 1 ? (cpu * 100).toFixed(1) : cpu.toFixed(1)) : "—";
                          const memVal = typeof mem === "number" ? (mem <= 1 ? (mem * 100).toFixed(1) : mem.toFixed(1)) : "—";
                          return (
                            <tr key={sm.service_name} className="border-b border-border/50 last:border-0">
                              <td className="px-3 py-2 text-white font-mono truncate max-w-[160px]" title={sm.service_name}>{sm.service_name}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.request_count != null ? sm.request_count.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.error_count != null ? sm.error_count.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.latency_p95_ms != null ? sm.latency_p95_ms.toFixed(0) : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{cpuVal}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{memVal}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.concurrent_requests != null ? sm.concurrent_requests : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.active_replicas != null ? sm.active_replicas : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Latency distribution (run-level) */}
              {displayMetrics.summary && (() => {
                const s = displayMetrics.summary;
                const barData = [
                  s.latency_p50_ms != null && { name: "P50", value: s.latency_p50_ms },
                  s.latency_p95_ms != null && { name: "P95", value: s.latency_p95_ms },
                  s.latency_p99_ms != null && { name: "P99", value: s.latency_p99_ms },
                  s.latency_mean_ms != null && { name: "Mean", value: s.latency_mean_ms },
                ].filter((x): x is { name: string; value: number } => Boolean(x));
                if (barData.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Latency distribution (ms)</h3>
                    <div className="rounded-lg border border-border bg-black/20 p-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                          <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "rgb(15 23 42)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8 }}
                            labelStyle={{ color: "rgba(255,255,255,0.8)" }}
                            formatter={(value) => [typeof value === "number" ? value.toFixed(0) : "—", "ms"]}
                          />
                          <Bar dataKey="value" fill="#38bdf8" name="Latency (ms)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Resource utilization (CPU / Memory gauges per service) */}
              {displayMetrics.metrics?.service_metrics && (() => {
                const withUtil = displayMetrics.metrics.service_metrics.filter(
                  (sm) => typeof sm.cpu_utilization === "number" || typeof sm.memory_utilization === "number"
                );
                if (withUtil.length === 0) return null;
                const toPct = (v: number) => (v <= 1 ? v * 100 : v);
                return (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Resource utilization</h3>
                    <div className="flex flex-wrap gap-4">
                      {withUtil.map((sm) => {
                        const cpuPct = typeof sm.cpu_utilization === "number" ? toPct(sm.cpu_utilization) : null;
                        const memPct = typeof sm.memory_utilization === "number" ? toPct(sm.memory_utilization) : null;
                        return (
                          <div
                            key={sm.service_name}
                            className="rounded-lg border border-border bg-black/20 p-3 flex items-center gap-4 min-w-[140px]"
                          >
                            <span className="text-xs text-white/70 truncate max-w-[100px]" title={sm.service_name}>{sm.service_name}</span>
                            <div className="flex gap-3">
                              {cpuPct != null && (
                                <div className="flex flex-col items-center">
                                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                                    <circle
                                      cx="18"
                                      cy="18"
                                      r="14"
                                      fill="none"
                                      stroke="#38bdf8"
                                      strokeWidth="4"
                                      strokeDasharray={`${cpuPct * 0.879} 88`}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <span className="text-[10px] text-white/50 mt-0.5">CPU</span>
                                  <span className="text-xs font-mono text-white">{cpuPct.toFixed(0)}%</span>
                                </div>
                              )}
                              {memPct != null && (
                                <div className="flex flex-col items-center">
                                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                                    <circle
                                      cx="18"
                                      cy="18"
                                      r="14"
                                      fill="none"
                                      stroke="#34d399"
                                      strokeWidth="4"
                                      strokeDasharray={`${memPct * 0.879} 88`}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <span className="text-[10px] text-white/50 mt-0.5">Mem</span>
                                  <span className="text-xs font-mono text-white">{memPct.toFixed(0)}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Concurrent requests from GET response (snapshot) */}
              {displayMetrics.metrics?.service_metrics && displayMetrics.metrics.service_metrics.some((sm) => typeof sm.concurrent_requests === "number") && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Concurrent requests (at snapshot)</h3>
                  <div className="flex flex-wrap gap-3">
                    {displayMetrics.metrics.service_metrics.map((sm) =>
                      typeof sm.concurrent_requests === "number" ? (
                        <div
                          key={sm.service_name}
                          className="rounded-lg border border-border bg-black/20 px-3 py-2 flex items-center gap-2"
                        >
                          <span className="text-xs text-white/60 truncate max-w-[120px]" title={sm.service_name}>{sm.service_name}</span>
                          <span className="text-sm font-mono font-semibold text-white tabular-nums">{sm.concurrent_requests}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {/* Timeseries charts (from persisted metrics response) */}
              {((displayMetrics.timeseriesProcessed?.length ?? 0) > 0 || (displayMetrics.timeseries?.length ?? 0) > 0) ? (
                <MetricsTimeseriesChart
                  timeseries={displayMetrics.timeseries}
                  timeseriesProcessed={displayMetrics.timeseriesProcessed}
                />
              ) : (
                <p className="text-xs text-white/30 italic">No timeseries data available.</p>
              )}

              {/* Time-series from GET .../metrics/timeseries API */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Metrics over time (API)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={timeseriesApiMetric}
                    onChange={(e) => setTimeseriesApiMetric(e.target.value)}
                    className="rounded border border-border bg-black/30 text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30"
                  >
                    <option value="request_latency_ms">Request latency (ms)</option>
                    <option value="request_count">Request count</option>
                  </select>
                  <button
                    type="button"
                    onClick={fetchTimeseriesApi}
                    disabled={timeseriesApiLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 disabled:opacity-50 text-xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${timeseriesApiLoading ? "animate-spin" : ""}`} />
                    {timeseriesApiRows.length ? "Refresh" : "Load timeseries"}
                  </button>
                </div>
                {timeseriesApiError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{timeseriesApiError}</p>
                )}
                {timeseriesApiRows.length > 0 && (() => {
                  const services = Array.from(new Set(timeseriesApiRows.flatMap((r) => Object.keys(r).filter((k) => k !== "_t"))));
                  const tMin = timeseriesApiRows[0]?._t as number | undefined;
                  const tMax = timeseriesApiRows[timeseriesApiRows.length - 1]?._t as number | undefined;
                  const allVals = timeseriesApiRows.flatMap((r) => services.map((s) => r[s]).filter((v): v is number => typeof v === "number"));
                  const vMax = Math.max(...allVals, 0) * 1.2 || 1;
                  return (
                    <div className="rounded-lg border border-border bg-black/20 p-3">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={timeseriesApiRows}
                          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis
                            dataKey="_t"
                            type="number"
                            domain={tMin != null && tMax != null ? [tMin, tMax] : undefined}
                            tickFormatter={(v: number) => new Date(v).toISOString().substring(11, 19)}
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            scale="time"
                            tickCount={6}
                          />
                          <YAxis domain={[0, vMax]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} width={45} tickCount={5} />
                          <Tooltip
                            contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)" }}
                            labelFormatter={(label) => typeof label === "number" ? new Date(label).toISOString() : String(label ?? "")}
                            formatter={(v, name) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), String(name ?? "")]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {services.map((svc, i) => (
                            <Line
                              key={svc}
                              dataKey={svc}
                              dot={false}
                              stroke={LINE_COLORS[i % LINE_COLORS.length]}
                              strokeWidth={1.5}
                              isAnimationActive={false}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Best candidate — shown once run is terminal; data from same /candidates API */}
      {isTerminal && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Best candidate</h2>
            <button
              onClick={fetchCandidates}
              disabled={candidatesLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${candidatesLoading ? "animate-spin" : ""}`} />
              {candidates === null ? "Load" : "Refresh"}
            </button>
          </div>

          {candidatesError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {candidatesError}
            </p>
          )}

          {candidatesLoading && (
            <div className="flex items-center gap-2 text-xs text-white/50 py-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}

          {bestCandidate && !candidatesLoading && !bestCandidate.best_candidate && (
            <p className="text-xs text-white/30 italic">No best-candidate data available for this run.</p>
          )}

          {bestCandidate?.best_candidate && !candidatesLoading && (
            <div className="space-y-4">
              {bestCandidate.best_candidate.s3_path && (
                <p className="text-[11px] text-white/30 font-mono truncate" title={bestCandidate.best_candidate.s3_path}>
                  S3: {bestCandidate.best_candidate.s3_path}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Hosts table */}
                {(bestCandidate.best_candidate.hosts?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-2">Hosts</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-border bg-white/5 text-white/40 text-left">
                            <th className="px-3 py-2 font-medium">Host ID</th>
                            <th className="px-3 py-2 font-medium">CPU cores</th>
                            <th className="px-3 py-2 font-medium">Mem (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bestCandidate.best_candidate.hosts!.map((h) => (
                            <tr key={h.host_id} className="border-b border-border/50">
                              <td className="px-3 py-2 text-white/80">{h.host_id}</td>
                              <td className="px-3 py-2 text-white/70">{h.cpu_cores ?? "—"}</td>
                              <td className="px-3 py-2 text-white/70">{h.memory_gb ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Services table */}
                {(bestCandidate.best_candidate.services?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-2">Services</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-border bg-white/5 text-white/40 text-left">
                            <th className="px-3 py-2 font-medium">Service ID</th>
                            <th className="px-3 py-2 font-medium">Replicas</th>
                            <th className="px-3 py-2 font-medium">CPU cores</th>
                            <th className="px-3 py-2 font-medium">Mem (MB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bestCandidate.best_candidate.services!.map((s) => (
                            <tr key={s.service_id} className="border-b border-border/50">
                              <td className="px-3 py-2 text-white/80">{s.service_id}</td>
                              <td className="px-3 py-2 text-white/70">{s.replicas ?? "—"}</td>
                              <td className="px-3 py-2 text-white/70">{s.cpu_cores ?? "—"}</td>
                              <td className="px-3 py-2 text-white/70">{s.memory_mb ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
