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
import { ArrowLeft, BarChart2, Clock3, History, Lock, Play, Plus, RefreshCw, Route, Settings2, SlidersHorizontal, Square, Trash2, Wifi, WifiOff } from "lucide-react";
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
import {
  extractSeriesScopeFromNormalized,
  extractSeriesScopeByLabelFromNormalized,
  flatTimeseriesLegendLabel,
  flatTimeseriesSeriesKeyFromNormalized,
  isUnscopedSeriesKey,
} from "@/lib/simulation/metrics-series-scope";
import {
  normalizePersistedMetricPoint,
  type NormalizedPersistedMetricPoint,
} from "@/lib/simulation/normalize-persisted-metric-point";
import {
  placementStatusFromFinalConfig,
  resolveFinalConfigForPlacement,
  type PlacementPersistenceStatus,
} from "@/lib/simulation/persisted-metrics-final-config";
import {
  buildOnlineConfigModel,
  buildPoliciesPatchPayloadFromModel,
  buildServicePatchPayloadFromModel,
  buildWorkloadPatchPayloadFromModel,
  type OnlineConfigModel,
} from "@/lib/simulation/online-config-model";
import { type RuntimeServiceDraft } from "@/lib/simulation/online-runtime-payload-validation";
import { getFirebaseIdToken } from "@/lib/firebase/auth";
import {
  patchRunConfiguration,
  patchRunWorkload,
  renewOnlineLease,
  startSimulationRun,
  stopSimulationRun,
  type PatchRunConfigurationBody,
  type PatchRunConfigurationWorkloadItem,
  type PatchRunConfigurationPolicies,
} from "@/lib/api-client/simulation";
import YAML from "yaml";
import ClusterPlacementView, {
} from "@/components/simulation/ClusterPlacementView";
import type {
  ClusterPlacementResources,
  ClusterPlacementHostResource,
  ClusterPlacementServiceResource,
  ClusterPlacementInstance,
  MetricPoint,
  MetricTimeseries,
  MetricsResponse,
  MetricsSummary,
  EndpointRequestStat,
  ServiceMetricSnapshot,
  SnapshotMetrics,
  HostMetricSnapshot,
  MetricUpdatePayload,
  OptimizationStepConfig,
  OptimizationStepEvent,
} from "@/types/simulation";

// ── Types ────────────────────────────────────────────────────────────────────

/** Editable config for Live config panel; matches PATCH shape. */
interface LiveConfig {
  services: RuntimeServiceDraft[];
  workload: PatchRunConfigurationWorkloadItem[];
  policies?: PatchRunConfigurationPolicies;
}

interface ObservedServiceRuntime {
  id: string;
  replicas?: number;
  cpu_cores?: number;
  memory_mb?: number;
  cpu_utilization?: number;
  memory_utilization?: number;
}

interface ObservedTrafficLane {
  pattern_key: string;
  observed_rate_rps?: number;
}

const DEFAULT_LIVE_CONFIG: LiveConfig = {
  services: [],
  workload: [],
  policies: { autoscaling: { enabled: false, target_cpu_util: 70, scale_step: 1 } },
};

function configFromStep(cfg: OptimizationStepConfig | undefined): LiveConfig | null {
  if (!cfg) return null;
  const services: RuntimeServiceDraft[] = (cfg.services ?? []).map((s) => ({
    id: s.id,
    replicas: s.replicas,
    cpu_cores: typeof (s as RuntimeServiceDraft).cpu_cores === "number" ? (s as RuntimeServiceDraft).cpu_cores : undefined,
    memory_mb: typeof (s as RuntimeServiceDraft).memory_mb === "number" ? (s as RuntimeServiceDraft).memory_mb : undefined,
  }));
  const workload: PatchRunConfigurationWorkloadItem[] = Array.isArray(cfg.workload)
    ? cfg.workload
        .map((w) => {
          const r = asRecord(w);
          if (!r) return null;
          const pattern_key = str(r.pattern_key);
          const rate_rps = num(r.rate_rps);
          if (!pattern_key || rate_rps == null) return null;
          return { pattern_key, rate_rps };
        })
        .filter((w): w is PatchRunConfigurationWorkloadItem => w !== null)
    : [];
  if (services.length === 0 && workload.length === 0) return null;
  return { services, workload, policies: DEFAULT_LIVE_CONFIG.policies };
}

type OptimizationStep = OptimizationStepEvent;

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
    latency_p95_ms?: number;
    latency_p99_ms?: number;
    p95_latency_ms?: number;
    throughput_rps?: number;
    failed_requests?: number;
    error_rate?: number;
    [key: string]: unknown;
  };
  sim_workload?: {
    concurrent_users?: number;
    [key: string]: unknown;
  };
  /** Same shape as best_candidate on /candidates when the API embeds topology per row. */
  topology?: BestCandidateTopology;
  hosts?: BestCandidateHost[];
  services?: BestCandidateService[];
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
  /** Current run configuration from backend (if returned by GET /runs/:id) */
  configuration?: {
    services?: { id?: string }[];
    workload?: { pattern_key?: string; rate_rps?: number }[];
  };
  metadata?: {
    name?: string;
    description?: string;
    mode?: string;
    objective?: string;
    lease_ttl_ms?: number;
    // optimization summary (batch / hill-climb)
    best_run_id?: string;
    /** Hill-climb: scalar objective. Batch: legacy efficiency only — use batch_efficiency_score / summary for semantics. */
    best_score?: number;
    iterations?: number;
    top_candidates?: string[];
    batch_recommendation_feasible?: boolean;
    batch_violation_score?: number;
    batch_efficiency_score?: number;
    batch_recommendation_summary?: string;
    batch_score_breakdown?: Record<string, unknown>;
    /** Batch recommendation: ordered candidate run ids from the search. */
    candidate_run_ids?: string[];
    /** Aggregated metrics for the recommended / best candidate (engine-specific shape). */
    best_candidate_metrics?: Record<string, unknown>;
    /** Optional snapshots for before/after configuration diff (YAML or JSON). */
    configuration_before?: unknown;
    configuration_after?: unknown;
    final_config?: unknown;
    online_completion_reason?: string;
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

type TimeseriesMetricBehavior = "cumulative_counter" | "gauge" | "observation";
type TimeseriesMetricUnit = "count" | "ms" | "percent" | "ratio" | "rps" | "raw";
type TimeseriesMetricOption = {
  value: string;
  label: string;
  unit: TimeseriesMetricUnit;
  behavior: TimeseriesMetricBehavior;
  description: string;
};

const TIMESERIES_METRIC_OPTIONS: TimeseriesMetricOption[] = [
  { value: "request_count", label: "Request count", unit: "count", behavior: "cumulative_counter", description: "Cumulative requests per label set." },
  { value: "request_error_count", label: "Request error count", unit: "count", behavior: "cumulative_counter", description: "Cumulative request errors per label set." },
  { value: "request_latency_ms", label: "Request latency", unit: "ms", behavior: "observation", description: "Observed request latency." },
  { value: "root_request_latency_ms", label: "Root request latency", unit: "ms", behavior: "observation", description: "End-to-end root request latency." },
  { value: "service_request_latency_ms", label: "Service request latency", unit: "ms", behavior: "observation", description: "Per-service hop latency." },
  { value: "queue_wait_ms", label: "Queue wait", unit: "ms", behavior: "observation", description: "Queueing wait before processing." },
  { value: "service_processing_latency_ms", label: "Service processing latency", unit: "ms", behavior: "observation", description: "In-service processing latency." },
  { value: "cpu_utilization", label: "CPU utilization", unit: "percent", behavior: "gauge", description: "Latest CPU utilization." },
  { value: "memory_utilization", label: "Memory utilization", unit: "percent", behavior: "gauge", description: "Latest memory utilization." },
  { value: "queue_length", label: "Queue length", unit: "count", behavior: "gauge", description: "Current queue length." },
  { value: "concurrent_requests", label: "Concurrent requests", unit: "count", behavior: "gauge", description: "Current in-flight requests." },
  { value: "active_connections", label: "Active connections", unit: "count", behavior: "gauge", description: "Current open connections." },
  { value: "route_selection_count", label: "Route selection count", unit: "count", behavior: "cumulative_counter", description: "Cumulative route selections." },
  { value: "route_rejection_count", label: "Route rejection count", unit: "count", behavior: "cumulative_counter", description: "Cumulative route rejections." },
  { value: "locality_route_hit_count", label: "Locality route hit count", unit: "count", behavior: "cumulative_counter", description: "Cumulative locality route hits." },
  { value: "locality_route_miss_count", label: "Locality route miss count", unit: "count", behavior: "cumulative_counter", description: "Cumulative locality route misses." },
  { value: "same_zone_request_count", label: "Same-zone request count", unit: "count", behavior: "cumulative_counter", description: "Cumulative same-zone requests." },
  { value: "cross_zone_request_count", label: "Cross-zone request count", unit: "count", behavior: "cumulative_counter", description: "Cumulative cross-zone requests." },
  { value: "cross_zone_latency_penalty_ms", label: "Cross-zone latency penalty", unit: "ms", behavior: "observation", description: "Cross-zone latency penalty observation." },
  { value: "same_zone_latency_penalty_ms", label: "Same-zone latency penalty", unit: "ms", behavior: "observation", description: "Same-zone latency penalty observation." },
  { value: "external_latency_penalty_ms", label: "External latency penalty", unit: "ms", behavior: "observation", description: "External latency penalty observation." },
  { value: "topology_latency_penalty_ms", label: "Topology latency penalty", unit: "ms", behavior: "observation", description: "Topology latency penalty observation." },
  { value: "ingress_logical_failure_count", label: "Ingress logical failure count", unit: "count", behavior: "cumulative_counter", description: "Cumulative ingress logical failures." },
  { value: "retry_attempts", label: "Retry attempts", unit: "count", behavior: "cumulative_counter", description: "Cumulative retry attempts." },
  { value: "db_wait_ms", label: "DB wait", unit: "ms", behavior: "observation", description: "Database wait latency observation." },
  { value: "cache_hit_count", label: "Cache hit count", unit: "count", behavior: "cumulative_counter", description: "Cumulative cache hits." },
  { value: "cache_miss_count", label: "Cache miss count", unit: "count", behavior: "cumulative_counter", description: "Cumulative cache misses." },
  { value: "downstream_caller_cpu_ms", label: "Downstream caller CPU", unit: "ms", behavior: "observation", description: "Caller CPU time in downstream calls." },
  { value: "queue_depth", label: "Queue depth", unit: "count", behavior: "gauge", description: "Current queue depth." },
  { value: "queue_publish_attempt_count", label: "Queue publish attempt count", unit: "count", behavior: "cumulative_counter", description: "Cumulative queue publish attempts." },
  { value: "queue_enqueue_count", label: "Queue enqueue count", unit: "count", behavior: "cumulative_counter", description: "Cumulative queue enqueues." },
  { value: "queue_dequeue_count", label: "Queue dequeue count", unit: "count", behavior: "cumulative_counter", description: "Cumulative queue dequeues." },
  { value: "queue_drop_count", label: "Queue drop count", unit: "count", behavior: "cumulative_counter", description: "Cumulative queue drops." },
  { value: "queue_redelivery_count", label: "Queue redelivery count", unit: "count", behavior: "cumulative_counter", description: "Cumulative queue redeliveries." },
  { value: "queue_dlq_count", label: "Queue DLQ count", unit: "count", behavior: "cumulative_counter", description: "Cumulative dead-letter events." },
  { value: "message_age_ms", label: "Message age", unit: "ms", behavior: "gauge", description: "Latest message age." },
  { value: "queue_publish_latency_ms", label: "Queue publish latency", unit: "ms", behavior: "observation", description: "Queue publish latency observation." },
  { value: "topic_publish_count", label: "Topic publish count", unit: "count", behavior: "cumulative_counter", description: "Cumulative topic publishes." },
  { value: "topic_deliver_count", label: "Topic deliver count", unit: "count", behavior: "cumulative_counter", description: "Cumulative topic deliveries." },
  { value: "topic_drop_count", label: "Topic drop count", unit: "count", behavior: "cumulative_counter", description: "Cumulative topic drops." },
  { value: "topic_redelivery_count", label: "Topic redelivery count", unit: "count", behavior: "cumulative_counter", description: "Cumulative topic redeliveries." },
  { value: "topic_dlq_count", label: "Topic DLQ count", unit: "count", behavior: "cumulative_counter", description: "Cumulative topic dead-letter events." },
  { value: "topic_backlog_depth", label: "Topic backlog depth", unit: "count", behavior: "gauge", description: "Current topic backlog depth." },
  { value: "topic_message_age_ms", label: "Topic message age", unit: "ms", behavior: "gauge", description: "Latest topic message age." },
  { value: "topic_publish_latency_ms", label: "Topic publish latency", unit: "ms", behavior: "observation", description: "Topic publish latency observation." },
  { value: "topic_consumer_lag", label: "Topic consumer lag", unit: "count", behavior: "gauge", description: "Current topic consumer lag." },
];

const TIMESERIES_GROUP_BY_OPTIONS = [
  { value: "auto", label: "Auto (legacy scope)" },
  { value: "service", label: "Service" },
  { value: "host", label: "Host" },
  { value: "instance", label: "Instance" },
  { value: "node", label: "Node" },
  { value: "endpoint", label: "Endpoint" },
  { value: "origin", label: "Origin" },
  { value: "reason", label: "Reason" },
  { value: "traffic_class", label: "Traffic class" },
  { value: "source_kind", label: "Source kind" },
  { value: "topic", label: "Topic" },
  { value: "consumer_group", label: "Consumer group" },
  { value: "broker", label: "Broker" },
  { value: "subscriber", label: "Subscriber" },
  { value: "strategy", label: "Strategy" },
  { value: "host_zone", label: "Host zone" },
  { value: "requested_zone", label: "Requested zone" },
] as const;

/** Sort by timestamp and keep one point per t (latest value wins). Used so we don't mix or duplicate. */
function sortAndDedupePoints(pts: TimePoint[]): TimePoint[] {
  if (pts.length <= 1) return pts;
  const byT = new Map<number, number>();
  for (const p of pts) byT.set(p.t, p.v);
  return Array.from(byT.entries()).sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

// ── Persisted metrics types ───────────────────────────────────────────────────
type TimeseriesPoint = MetricPoint;

type PlacementStatus = PlacementPersistenceStatus;

/** Precomputed chart rows from Web Worker (when timeseries processed off main thread) */
export type TimeseriesProcessedItem = { metric: string; rows: ChartRow[] };

type DashboardMetricsResponse = MetricsResponse & {
  /** When set, chart uses this instead of building rows from timeseries */
  timeseriesProcessed?: TimeseriesProcessedItem[];
  metrics?: SnapshotMetrics;
};

interface UnscopedMetricDebugPoint {
  source: "metrics.timeseries" | "metrics/timeseries";
  metric: string;
  timestamp: string;
  value: number;
  labels?: Record<string, string | number | boolean | undefined>;
  tags?: Record<string, unknown>;
  service_id?: string;
  instance_id?: string;
  host_id?: string;
  node_id?: string;
}

function mergeUnscopedDebugPoints(
  prev: UnscopedMetricDebugPoint[],
  incoming: UnscopedMetricDebugPoint[],
): UnscopedMetricDebugPoint[] {
  if (incoming.length === 0) return prev;
  const map = new Map<string, UnscopedMetricDebugPoint>();
  const sig = (p: UnscopedMetricDebugPoint) =>
    `${p.source}|${p.metric}|${p.timestamp}|${p.value}|${JSON.stringify(p.labels ?? {})}|${JSON.stringify(p.tags ?? {})}|${p.service_id ?? ""}|${p.instance_id ?? ""}|${p.host_id ?? ""}|${p.node_id ?? ""}`;
  for (const p of prev) {
    map.set(sig(p), p);
  }
  for (const p of incoming) {
    map.set(sig(p), p);
  }
  return Array.from(map.values()).slice(-250);
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
  drain_sweep:           "bg-violet-500/20 text-violet-300",
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "stopped"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function text(v: unknown): string | undefined {
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed !== "" ? trimmed : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function normalizeClusterResources(input: unknown): ClusterPlacementResources | null {
  const root = asRecord(input);
  if (!root) return null;

  const rawHosts = Array.isArray(root.hosts) ? root.hosts : [];
  const rawServices = Array.isArray(root.services) ? root.services : [];
  const rawPlacements = Array.isArray(root.placements) ? root.placements : [];

  const hosts: ClusterPlacementHostResource[] = [];
  for (const h of rawHosts) {
    const r = asRecord(h);
    if (!r) continue;
    const host_id = str(r.host_id) ?? str(r.id);
    if (!host_id) continue;
    hosts.push({
      host_id,
      cpu_cores: num(r.cpu_cores) ?? num(r.cores),
      memory_gb: num(r.memory_gb),
      cpu_utilization: num(r.cpu_utilization),
      memory_utilization: num(r.memory_utilization),
    });
  }

  const services: ClusterPlacementServiceResource[] = [];
  for (const s of rawServices) {
    const r = asRecord(s);
    if (!r) continue;
    const service_id = str(r.service_id) ?? str(r.id);
    if (!service_id) continue;
    services.push({
      service_id,
      replicas: num(r.replicas),
      cpu_cores: num(r.cpu_cores),
      memory_mb: num(r.memory_mb),
    });
  }

  const placements: ClusterPlacementInstance[] = [];
  for (const p of rawPlacements) {
    const r = asRecord(p);
    if (!r) continue;
    const service_id = str(r.service_id) ?? str(r.service) ?? "unknown-service";
    placements.push({
      service_id,
      instance_id: str(r.instance_id) ?? str(r.instance),
      host_id: str(r.host_id) ?? str(r.host),
      lifecycle: str(r.lifecycle) ?? str(r.state),
      cpu_cores: num(r.cpu_cores),
      memory_mb: num(r.memory_mb),
      cpu_utilization: num(r.cpu_utilization),
      memory_utilization: num(r.memory_utilization),
      active_requests: num(r.active_requests),
      queue_length: num(r.queue_length),
    });
  }

  const rawQueues = Array.isArray(root.queues) ? root.queues : [];
  const queues = rawQueues
    .map((q) => {
      const r = asRecord(q);
      if (!r) return null;
      const broker = str(r.broker) ?? str(r.broker_service);
      const topic = str(r.topic);
      if (!broker || !topic) return null;
      return {
        broker,
        broker_service: broker,
        topic,
        depth: num(r.depth),
        in_flight: num(r.in_flight),
        max_concurrency: num(r.max_concurrency),
        consumer_target: text(r.consumer_target),
        oldest_message_age_ms: num(r.oldest_message_age_ms),
        drop_count: num(r.drop_count),
        redelivery_count: num(r.redelivery_count),
        dlq_count: num(r.dlq_count),
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  const rawTopics = Array.isArray(root.topics) ? root.topics : [];
  const topics = rawTopics
    .map((t) => {
      const r = asRecord(t);
      if (!r) return null;
      const broker = str(r.broker) ?? str(r.broker_service);
      const topic = str(r.topic);
      if (!broker || !topic) return null;
      return {
        broker,
        broker_service: broker,
        topic,
        partition: text(r.partition),
        subscriber: str(r.subscriber),
        consumer_group: str(r.consumer_group),
        depth: num(r.depth),
        in_flight: num(r.in_flight),
        max_concurrency: num(r.max_concurrency),
        consumer_target: text(r.consumer_target),
        oldest_message_age_ms: num(r.oldest_message_age_ms),
        drop_count: num(r.drop_count),
        redelivery_count: num(r.redelivery_count),
        dlq_count: num(r.dlq_count),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return { hosts, services, placements, queues, topics };
}

function isBatchOptimizationMeta(m?: RunInfo["metadata"]): boolean {
  if (!m) return false;
  if (m.objective === "recommended_config") return true;
  const mode = m.mode;
  if (mode === "batch" || mode === "batch_optimization" || mode === "batch_recommendation") return true;
  return (
    m.batch_efficiency_score != null ||
    m.batch_violation_score != null ||
    typeof m.batch_recommendation_feasible === "boolean" ||
    (typeof m.batch_recommendation_summary === "string" && m.batch_recommendation_summary.length > 0) ||
    (m.batch_score_breakdown != null && typeof m.batch_score_breakdown === "object")
  );
}

const CANDIDATES_TABLE_COL_COUNT = 16;

const BEST_CANDIDATE_WHY_TOOLTIP =
  "Selected because it met performance guardrails and had the lowest efficiency score among evaluated candidates.";

function candidateAsRecord(c: Candidate): Record<string, unknown> {
  return c as unknown as Record<string, unknown>;
}

function asHostArray(v: unknown): BestCandidateHost[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x) => x && typeof x === "object") as BestCandidateHost[];
}

function asServiceArray(v: unknown): BestCandidateService[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x) => x && typeof x === "object") as BestCandidateService[];
}

/** Hosts from topology, top-level, or nested spec (engine shapes vary). */
function getCandidateHostsList(c: Candidate, bestTopology?: BestCandidateTopology | null): BestCandidateHost[] {
  const r = candidateAsRecord(c);
  const top = r.topology;
  if (top && typeof top === "object") {
    const h = asHostArray((top as BestCandidateTopology).hosts);
    if (h?.length) return h;
  }
  const root = asHostArray(r.hosts);
  if (root?.length) return root;
  const spec = r.spec;
  if (spec && typeof spec === "object") {
    const sh = asHostArray((spec as Record<string, unknown>).hosts);
    if (sh?.length) return sh;
  }
  if (bestTopology) {
    const bh = asHostArray(bestTopology.hosts);
    if (bh?.length) return bh;
  }
  return [];
}

function getCandidateServicesList(
  c: Candidate,
  bestTopology?: BestCandidateTopology | null,
): BestCandidateService[] {
  const r = candidateAsRecord(c);
  const top = r.topology;
  if (top && typeof top === "object") {
    const s = asServiceArray((top as BestCandidateTopology).services);
    if (s?.length) return s;
  }
  const root = asServiceArray(r.services);
  if (root?.length) return root;
  const spec = r.spec;
  if (spec && typeof spec === "object") {
    const ss = asServiceArray((spec as Record<string, unknown>).services);
    if (ss?.length) return ss;
  }
  if (bestTopology) {
    const bs = asServiceArray(bestTopology.services);
    if (bs?.length) return bs;
  }
  return [];
}

function joinHostField(hosts: BestCandidateHost[], field: "cpu_cores" | "memory_gb"): string {
  if (hosts.length === 0) return "—";
  return hosts
    .map((h) => {
      const v = h[field];
      return v != null && Number.isFinite(v) ? String(v) : "—";
    })
    .join(" / ");
}

function joinServiceField(
  services: BestCandidateService[],
  field: "replicas" | "cpu_cores" | "memory_mb",
): string {
  if (services.length === 0) return "—";
  return services
    .map((s) => {
      const v = s[field];
      return v != null && Number.isFinite(v) ? String(v) : "—";
    })
    .join(" / ");
}

function candidateHostResourceCells(
  c: Candidate,
  bestTopology?: BestCandidateTopology | null,
): { cores: string; memGb: string } {
  const hosts = getCandidateHostsList(c, bestTopology);
  if (hosts.length > 0) {
    return { cores: joinHostField(hosts, "cpu_cores"), memGb: joinHostField(hosts, "memory_gb") };
  }
  const vcpu = c.spec?.vcpu;
  const mem = c.spec?.memory_gb;
  return {
    cores: vcpu != null && Number.isFinite(vcpu) ? String(vcpu) : "—",
    memGb: mem != null && Number.isFinite(mem) ? String(mem) : "—",
  };
}

function candidateMetricNumber(m: Candidate["metrics"], keys: string[]): number | undefined {
  if (!m) return undefined;
  const r = m as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

const RUN_BATCH_SUMMARY_TOOLTIP =
  "From this run’s batch recommendation summary (authoritative for the overall search). Per-candidate values appear when the API attaches them to each row.";

const SVC_TOPOLOGY_ROW_TOOLTIP =
  "Per-candidate service sizing when the API returns topology on each child run. If blank, expand the row or check the Best row / Optimization summary for the recommended layout.";

function batchScoreBreakdownRecord(meta?: RunInfo["metadata"]): Record<string, unknown> | undefined {
  const b = meta?.batch_score_breakdown;
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return undefined;
}

function metaBatchFeasible(meta?: RunInfo["metadata"]): boolean | undefined {
  if (typeof meta?.batch_recommendation_feasible === "boolean") return meta.batch_recommendation_feasible;
  const bd = batchScoreBreakdownRecord(meta);
  const v = bd?.batch_recommendation_feasible ?? bd?.feasible ?? bd?.batch_feasible;
  if (typeof v === "boolean") return v;
  return undefined;
}

function metaBatchEfficiencyScore(meta?: RunInfo["metadata"]): number | undefined {
  const direct = meta?.batch_efficiency_score;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const bd = batchScoreBreakdownRecord(meta);
  const v = bd?.batch_efficiency_score ?? bd?.efficiency_score;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function formatErrorRateCell(m: Candidate["metrics"] | undefined): string {
  const direct = candidateMetricNumber(m, ["error_rate", "errors_rate", "failure_rate"]);
  if (direct != null) {
    if (direct >= 0 && direct <= 1) return `${(direct * 100).toFixed(2)}%`;
    return `${direct.toFixed(2)}%`;
  }
  const failed = candidateMetricNumber(m, [
    "failed_requests",
    "failed",
    "total_errors",
    "error_count",
    "errors",
  ]);
  const total = candidateMetricNumber(m, [
    "total_requests",
    "requests_total",
    "request_count",
    "num_requests",
  ]);
  if (total !== undefined && total === 0) return "N/A";
  const success = candidateMetricNumber(m, ["successful_requests", "success_requests", "succeeded_requests"]);
  let denom = total;
  if ((denom == null || !Number.isFinite(denom) || denom <= 0) && success != null && failed != null) {
    denom = success + failed;
  }
  if (failed == null || !Number.isFinite(failed) || denom == null || !Number.isFinite(denom) || denom <= 0) {
    return "—";
  }
  return `${((failed / denom) * 100).toFixed(2)}%`;
}

/** When the engine stores winner metrics only on run metadata, merge them into that candidate row. */
function candidateMetricsForDisplay(
  c: Candidate,
  meta: RunInfo["metadata"] | undefined,
): Candidate["metrics"] | undefined {
  const base = c.metrics;
  const bid = meta?.best_run_id;
  const bcm = meta?.best_candidate_metrics;
  if (typeof bid === "string" && c.id === bid && bcm && typeof bcm === "object" && !Array.isArray(bcm)) {
    return { ...(base ?? {}), ...(bcm as Record<string, unknown>) } as Candidate["metrics"];
  }
  return base;
}

function formatBatchScoreNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

const BOTTLENECK_THRESHOLDS = {
  queueShare: 0.25,
  highUtilPct: 75,
  lowUtilPct: 25,
  highLatencyMs: 250,
  unexplainedLatencyShare: 0.5,
} as const;

type BottleneckTag =
  | "queue-bound"
  | "CPU-bound"
  | "memory-bound"
  | "downstream/topology-bound"
  | "underutilized"
  | "healthy";

const ENDPOINT_TRIAGE_THRESHOLDS = {
  lowVolumeRequests: 10,
  failingErrorRate: 0.05,
  queueBoundShare: 0.25,
  processingBoundShare: 0.5,
  downstreamRootHopRatio: 1.5,
} as const;

type EndpointTriageTag =
  | "failing"
  | "queue-bound"
  | "processing-bound"
  | "downstream/topology-bound"
  | "low-volume"
  | "healthy";

const TOPOLOGY_HEALTH_THRESHOLDS = {
  localityWatchMin: 0.8,
  localityDegradedMin: 0.6,
  crossZoneWatch: 0.25,
  crossZoneDegraded: 0.5,
  topologyPenaltyWatchMs: 10,
  topologyPenaltyDegradedMs: 50,
} as const;

type TopologyHealth = "healthy" | "watch" | "degraded";

function toPercent(v: number | undefined): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v <= 1 ? v * 100 : v;
}

function formatPercent(v: number | undefined, digits = 1): string {
  const pct = toPercent(v);
  return pct != null ? `${pct.toFixed(digits)}%` : "—";
}

function formatMs(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(0)} ms` : "—";
}

function hasNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function formatCount(v?: number): string {
  return hasNumber(v) ? v.toLocaleString() : "—";
}

function formatPair(left?: number, right?: number): string {
  return `${formatCount(left)} / ${formatCount(right)}`;
}

function normalizeFraction(v: number | undefined): number | undefined {
  if (!hasNumber(v)) return undefined;
  if (v < 0) return undefined;
  if (v <= 1) return v;
  if (v <= 100) return v / 100;
  return undefined;
}

function classifyTopologyHealth(
  localityHitRate: number | undefined,
  crossZoneFraction: number | undefined,
  topologyPenaltyMeanMs: number | undefined,
): TopologyHealth {
  if (
    (hasNumber(localityHitRate) && localityHitRate < TOPOLOGY_HEALTH_THRESHOLDS.localityDegradedMin) ||
    (hasNumber(crossZoneFraction) && crossZoneFraction > TOPOLOGY_HEALTH_THRESHOLDS.crossZoneDegraded) ||
    (hasNumber(topologyPenaltyMeanMs) && topologyPenaltyMeanMs > TOPOLOGY_HEALTH_THRESHOLDS.topologyPenaltyDegradedMs)
  ) {
    return "degraded";
  }
  if (
    (hasNumber(localityHitRate) && localityHitRate < TOPOLOGY_HEALTH_THRESHOLDS.localityWatchMin) ||
    (hasNumber(crossZoneFraction) && crossZoneFraction > TOPOLOGY_HEALTH_THRESHOLDS.crossZoneWatch) ||
    (hasNumber(topologyPenaltyMeanMs) && topologyPenaltyMeanMs > TOPOLOGY_HEALTH_THRESHOLDS.topologyPenaltyWatchMs)
  ) {
    return "watch";
  }
  return "healthy";
}

function topologyHealthClasses(health: TopologyHealth): string {
  switch (health) {
    case "degraded":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "watch":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function endpointErrorRate(requestCount: number | undefined, errorCount: number | undefined): number | undefined {
  if (!hasNumber(requestCount) || requestCount <= 0 || !hasNumber(errorCount)) return undefined;
  return errorCount / requestCount;
}

function classifyEndpointTriage(sm: EndpointRequestStat): EndpointTriageTag {
  const requests = hasNumber(sm.request_count) ? sm.request_count : undefined;
  const errors = hasNumber(sm.error_count) ? sm.error_count : undefined;
  const hopP95 = hasNumber(sm.latency_p95_ms) ? sm.latency_p95_ms : undefined;
  const rootP95 = hasNumber(sm.root_latency_p95_ms) ? sm.root_latency_p95_ms : undefined;
  const queueP95 = hasNumber(sm.queue_wait_p95_ms) ? sm.queue_wait_p95_ms : undefined;
  const processingP95 = hasNumber(sm.processing_latency_p95_ms) ? sm.processing_latency_p95_ms : undefined;
  const errRate = endpointErrorRate(requests, errors);

  if (hasNumber(errRate) && errRate >= ENDPOINT_TRIAGE_THRESHOLDS.failingErrorRate) return "failing";
  if (hasNumber(requests) && requests < ENDPOINT_TRIAGE_THRESHOLDS.lowVolumeRequests) return "low-volume";
  if (hasNumber(hopP95) && hopP95 > 0 && hasNumber(queueP95) && queueP95 / hopP95 >= ENDPOINT_TRIAGE_THRESHOLDS.queueBoundShare) {
    return "queue-bound";
  }
  if (
    hasNumber(hopP95) &&
    hopP95 > 0 &&
    hasNumber(processingP95) &&
    processingP95 / hopP95 >= ENDPOINT_TRIAGE_THRESHOLDS.processingBoundShare
  ) {
    return "processing-bound";
  }
  if (hasNumber(rootP95) && hasNumber(hopP95) && hopP95 > 0 && rootP95 > hopP95 * ENDPOINT_TRIAGE_THRESHOLDS.downstreamRootHopRatio) {
    return "downstream/topology-bound";
  }
  return "healthy";
}

function endpointTriageTagClasses(tag: EndpointTriageTag): string {
  switch (tag) {
    case "failing":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "queue-bound":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "processing-bound":
      return "border-orange-500/30 bg-orange-500/10 text-orange-200";
    case "downstream/topology-bound":
      return "border-violet-500/30 bg-violet-500/10 text-violet-200";
    case "low-volume":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function asUnknownRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function getOptimizationActionLabel(reasonDetails: Record<string, unknown> | undefined): string | undefined {
  if (!reasonDetails) return undefined;
  return toStr(reasonDetails.type) ?? toStr(reasonDetails.action);
}

function summarizeConfigDiff(previousConfig: unknown, currentConfig: unknown): string[] {
  const prevRec = asUnknownRecord(previousConfig) ?? {};
  const currRec = asUnknownRecord(currentConfig) ?? {};
  const lines: string[] = [];

  const prevServices = Array.isArray(prevRec.services) ? prevRec.services : [];
  const currServices = Array.isArray(currRec.services) ? currRec.services : [];
  const prevById = new Map<string, Record<string, unknown>>();
  for (const s of prevServices) {
    const rec = asUnknownRecord(s);
    const id = toStr(rec?.id);
    if (rec && id) prevById.set(id, rec);
  }
  for (const s of currServices) {
    const rec = asUnknownRecord(s);
    const id = toStr(rec?.id);
    if (!rec || !id) continue;
    const prev = prevById.get(id);
    if (!prev) continue;
    const prevRep = hasNumber(prev.replicas) ? prev.replicas : undefined;
    const currRep = hasNumber(rec.replicas) ? rec.replicas : undefined;
    if (prevRep !== currRep && (prevRep != null || currRep != null)) lines.push(`${id} replicas ${prevRep ?? "—"} -> ${currRep ?? "—"}`);
    const prevCpu = hasNumber(prev.cpu_cores) ? prev.cpu_cores : undefined;
    const currCpu = hasNumber(rec.cpu_cores) ? rec.cpu_cores : undefined;
    if (prevCpu !== currCpu && (prevCpu != null || currCpu != null)) lines.push(`${id} CPU ${prevCpu ?? "—"} -> ${currCpu ?? "—"}`);
    const prevMem = hasNumber(prev.memory_mb) ? prev.memory_mb : undefined;
    const currMem = hasNumber(rec.memory_mb) ? rec.memory_mb : undefined;
    if (prevMem !== currMem && (prevMem != null || currMem != null)) lines.push(`${id} memory ${prevMem ?? "—"} -> ${currMem ?? "—"} MB`);
  }

  const prevHosts = Array.isArray(prevRec.hosts) ? prevRec.hosts : [];
  const currHosts = Array.isArray(currRec.hosts) ? currRec.hosts : [];
  if (prevHosts.length !== currHosts.length) lines.push(`hosts ${prevHosts.length} -> ${currHosts.length}`);

  const prevPlacements = Array.isArray(prevRec.placements) ? prevRec.placements : [];
  const currPlacements = Array.isArray(currRec.placements) ? currRec.placements : [];
  if (prevPlacements.length !== currPlacements.length) lines.push(`placements ${prevPlacements.length} -> ${currPlacements.length}`);

  return lines;
}

function formatTargetDelta(scoreP95: number | undefined, targetP95: number | undefined): string {
  if (!hasNumber(scoreP95) || !hasNumber(targetP95)) return "target delta unavailable";
  const delta = scoreP95 - targetP95;
  const dir = delta > 0 ? "over target" : "under target";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} ms ${dir}`;
}

function optimizationStepFallbackSignature(step: OptimizationStep): string {
  const rd = asUnknownRecord(step.reason_details);
  return [
    toStr(step.reason) ?? "",
    hasNumber(step.score_p95_ms) ? step.score_p95_ms.toFixed(4) : "",
    hasNumber(step.target_p95_ms) ? step.target_p95_ms.toFixed(4) : "",
    toStr(rd?.type) ?? "",
    toStr(rd?.action) ?? "",
  ].join("|");
}

function isOptimizerStepBlocked(step: OptimizationStep): boolean {
  const rd = asUnknownRecord(step.reason_details);
  const type = toStr(rd?.type)?.toLowerCase();
  const decisionReason = toStr(rd?.decision_reason)?.toLowerCase();
  const action = toStr(rd?.action)?.toLowerCase();
  if (type?.includes("topology_guard_blocked")) return true;
  if (decisionReason && /(blocked|guard|no[_ -]?op|noop|below_min|not_apply|skipped)/.test(decisionReason)) return true;
  const hasUsableConfigs = asUnknownRecord(step.previous_config) != null && asUnknownRecord(step.current_config) != null;
  if (action && hasUsableConfigs) {
    const changes = summarizeConfigDiff(step.previous_config, step.current_config);
    if (changes.length === 0) return true;
  }
  return false;
}

function classifyServiceBottleneck(sm: ServiceMetricSnapshot): BottleneckTag {
  const latency = typeof sm.latency_p95_ms === "number" ? sm.latency_p95_ms : undefined;
  const queueWait = typeof sm.queue_wait_p95_ms === "number" ? sm.queue_wait_p95_ms : undefined;
  const processing = typeof sm.processing_latency_p95_ms === "number" ? sm.processing_latency_p95_ms : undefined;
  const queueLength = typeof sm.queue_length === "number" ? sm.queue_length : undefined;
  const cpu = toPercent(sm.cpu_utilization);
  const mem = toPercent(sm.memory_utilization);
  const replicas = typeof sm.active_replicas === "number" ? sm.active_replicas : undefined;

  if (
    (latency != null && queueWait != null && latency > 0 && queueWait / latency >= BOTTLENECK_THRESHOLDS.queueShare) ||
    (queueLength != null && queueLength > 0)
  ) {
    return "queue-bound";
  }
  if (cpu != null && cpu > BOTTLENECK_THRESHOLDS.highUtilPct) return "CPU-bound";
  if (mem != null && mem > BOTTLENECK_THRESHOLDS.highUtilPct) return "memory-bound";
  if (
    cpu != null &&
    mem != null &&
    cpu < BOTTLENECK_THRESHOLDS.lowUtilPct &&
    mem < BOTTLENECK_THRESHOLDS.lowUtilPct &&
    replicas != null &&
    replicas > 1
  ) {
    return "underutilized";
  }
  if (latency != null && latency >= BOTTLENECK_THRESHOLDS.highLatencyMs) {
    const explained = (queueWait ?? 0) + (processing ?? 0);
    if (explained / latency < BOTTLENECK_THRESHOLDS.unexplainedLatencyShare) {
      return "downstream/topology-bound";
    }
  }
  return "healthy";
}

function bottleneckTagClasses(tag: BottleneckTag): string {
  switch (tag) {
    case "queue-bound":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "CPU-bound":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "memory-bound":
      return "border-orange-500/30 bg-orange-500/10 text-orange-200";
    case "downstream/topology-bound":
      return "border-violet-500/30 bg-violet-500/10 text-violet-200";
    case "underutilized":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function candidateBatchFeasibleCell(
  c: Candidate,
  meta: RunInfo["metadata"] | undefined,
): { text: string; fromRunSummary: boolean } {
  const r = candidateAsRecord(c);
  const row = r.batch_recommendation_feasible ?? r.batch_feasible;
  if (typeof row === "boolean") return { text: row ? "Yes" : "No", fromRunSummary: false };
  const run = metaBatchFeasible(meta);
  if (typeof run === "boolean") return { text: run ? "Yes" : "No", fromRunSummary: true };
  return { text: "—", fromRunSummary: false };
}

function candidateBatchEfficiencyCell(
  c: Candidate,
  meta: RunInfo["metadata"] | undefined,
): { text: string; fromRunSummary: boolean } {
  const r = candidateAsRecord(c);
  for (const k of ["batch_efficiency_score", "efficiency_score"] as const) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return { text: formatBatchScoreNumber(v), fromRunSummary: false };
    }
  }
  const bd = batchScoreBreakdownRecord(meta);
  const nested = bd?.batch_efficiency_score ?? bd?.efficiency_score;
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return { text: formatBatchScoreNumber(nested), fromRunSummary: true };
  }
  const run = metaBatchEfficiencyScore(meta);
  if (typeof run === "number" && Number.isFinite(run)) return { text: formatBatchScoreNumber(run), fromRunSummary: true };
  return { text: "—", fromRunSummary: false };
}

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
          const n = normalizePersistedMetricPoint(p, ts.metric);
          if (!n) continue;
          const key = n.timestamp;
          if (!rowMap[key]) rowMap[key] = { _t: new Date(n.timestamp).getTime() };
          rowMap[key][extractSeriesScopeFromNormalized(n)] = n.value;
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

        const services = (useProcessed
          ? Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "_t"))))
          : Array.from(
              new Set(
                (timeseries!.find((ts) => ts.metric === item.metric)?.points ?? []).map((p) => {
                  const n = normalizePersistedMetricPoint(p, item.metric);
                  return n ? extractSeriesScopeFromNormalized(n) : "unscoped";
                }),
              ),
            )).filter((svc) => !isUnscopedSeriesKey(svc));

        if (services.length === 0) {
          return (
            <div key={item.metric}>
              <p className="text-xs text-white/50 mb-1 font-mono">{item.metric}</p>
              <p className="text-[11px] text-white/35 italic">
                Only unscoped points reported. See the unscoped metrics debug panel.
              </p>
            </div>
          );
        }

        const tMin = rows[0]._t as number;
        const tMax = rows[rows.length - 1]._t as number;
        const allVals = rows.flatMap((r) =>
          Object.entries(r)
            .filter(([k]) => k !== "_t" && !isUnscopedSeriesKey(k))
            .map(([, v]) => v as number),
        );
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
  const [metricsData, setMetricsData] = useState<DashboardMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  // Live metrics from SSE metrics_snapshot (used while run is running)
  const [liveMetricsData, setLiveMetricsData] = useState<DashboardMetricsResponse | null>(null);
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
  // Host-level metrics: from metric_update host labels/ids or metrics_snapshot host_metrics; gauges = latest value
  const [hostMetrics, setHostMetrics] = useState<Record<string, { cpu_utilization?: number; memory_utilization?: number }>>({});
  const [hostResources, setHostResources] = useState<Record<string, { cpu_cores?: number; memory_gb?: number }>>({});
  const [clusterResources, setClusterResources] = useState<ClusterPlacementResources | null>(null);
  const [livePlacementStatus, setLivePlacementStatus] = useState<PlacementStatus>("unavailable");
  // Timeseries from GET .../metrics/timeseries API (for line chart over time)
  const [timeseriesApiRows, setTimeseriesApiRows] = useState<ChartRow[]>([]);
  const [unscopedMetricDebug, setUnscopedMetricDebug] = useState<UnscopedMetricDebugPoint[]>([]);
  const [timeseriesApiMetric, setTimeseriesApiMetric] = useState<string>("request_latency_ms");
  const [timeseriesGroupBy, setTimeseriesGroupBy] = useState<string>("auto");
  const [timeseriesApiLoading, setTimeseriesApiLoading] = useState(false);
  const [timeseriesApiError, setTimeseriesApiError] = useState<string | null>(null);
  // Live config (online mode) — editable form state; synced from optimization_step
  const [liveConfig, setLiveConfig] = useState<LiveConfig | null>(null);
  const [serviceMixerDrafts, setServiceMixerDrafts] = useState<Record<string, RuntimeServiceDraft>>({});
  const [trafficConsoleDrafts, setTrafficConsoleDrafts] = useState<
    Record<string, { pattern_key?: string; rate_rps?: number }>
  >({});
  const [pendingServiceObservationById, setPendingServiceObservationById] = useState<
    Record<string, { replicas: number; cpu_cores?: number; memory_mb?: number; updatedAt: number }>
  >({});
  const [pendingTrafficObservationByPattern, setPendingTrafficObservationByPattern] = useState<
    Record<string, { rate_rps: number; updatedAt: number }>
  >({});
  const [controlRoomTab, setControlRoomTab] = useState<
    "services" | "traffic" | "autoscaling" | "lease" | "locked" | "change_log"
  >("services");
  const [manualLeaseRenewLoading, setManualLeaseRenewLoading] = useState(false);
  const [configUpdateLoading, setConfigUpdateLoading] = useState(false);
  const [configUpdateError, setConfigUpdateError] = useState<string | null>(null);
  /** Latest optimization_progress SSE (objective / unit clarify best_score in that stream). */
  const [optProgressHint, setOptProgressHint] = useState<{
    objective?: string;
    unit?: string;
    best_score?: number;
  } | null>(null);
  const [leaseRenewError, setLeaseRenewError] = useState<string | null>(null);
  const [leaseRenewStatus, setLeaseRenewStatus] = useState<"idle" | "ok" | "error">("idle");
  const nextLeaseRenewAtRef = useRef<number | null>(null);
  const onlineConfigModelRef = useRef<OnlineConfigModel | null>(null);

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
    if (type === "optimization_progress") {
      try {
        const parsed = JSON.parse(data) as { data?: Record<string, unknown> } & Record<string, unknown>;
        const inner = (parsed?.data ?? parsed) as Record<string, unknown>;
        const objective = inner.objective != null ? String(inner.objective) : undefined;
        const unit = inner.unit != null ? String(inner.unit) : undefined;
        const best_score =
          typeof inner.best_score === "number"
            ? inner.best_score
            : typeof inner.bestScore === "number"
              ? inner.bestScore
              : undefined;
        setOptProgressHint({ objective, unit, best_score });
      } catch {
        /* ignore */
      }
    }

    if (type === "optimization_step") {
      try {
        const payload = JSON.parse(data) as { data?: OptimizationStep };
        const step = payload.data;
        if (step) {
          setOptSteps((prev) => {
            if (step.iteration_index != null) {
              const existsByIteration = prev.some((s) => s.iteration_index === step.iteration_index);
              return existsByIteration ? prev : [...prev, step];
            }
            const sig = optimizationStepFallbackSignature(step);
            if (!sig || sig === "||||") return [...prev, step];
            const existsBySig = prev.some((s) => s.iteration_index == null && optimizationStepFallbackSignature(s) === sig);
            return existsBySig ? prev : [...prev, step];
          });
          const fromStep = configFromStep(step.current_config);
          if (fromStep) setLiveConfig(fromStep);
        }
      } catch { /* malformed — ignore */ }
    }

    if (type === "metric_update") {
      try {
        const outer = JSON.parse(data) as MetricUpdatePayload & { data?: MetricUpdatePayload };
        // Backend wraps the metric inside a "data" field: { data: {...}, event, run_id }
        // Fall back to flat format for older/direct payloads.
        const m: MetricUpdatePayload = outer.data ?? outer;
        const svc = (m.labels?.service ?? m.service_id ?? m.service_name) as string | undefined;
        if (svc) knownServicesRef.current.add(svc);

        // Host-level metrics: gauges, use latest value for any non-empty host id
        const rawHostId = m.labels?.host ?? m.labels?.host_id ?? m.host_id;
        const hostId = typeof rawHostId === "string" && rawHostId.trim() ? rawHostId : undefined;
        if (hostId && m.value != null) {
          const metricName = m.metric;
          if (metricName === "cpu_utilization" || metricName === "memory_utilization") {
            setHostMetrics((prev) => ({
              ...prev,
              [hostId]: {
                ...prev[hostId],
                [metricName]: m.value,
              },
            }));
          }
        }

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
          data?: {
            metrics?: SnapshotMetrics;
            host_metrics?: HostMetricSnapshot[];
            resources?: ClusterPlacementResources;
          };
          metrics?: SnapshotMetrics;
        };
        const dataPayload = parsed.data;
        const normalizedResources = normalizeClusterResources(dataPayload?.resources);
        const liveStatusNow = placementStatusFromFinalConfig(dataPayload?.resources);
        const resourcePayload = asRecord(dataPayload?.resources);
        const hasQueuesArray = !!resourcePayload && Object.prototype.hasOwnProperty.call(resourcePayload, "queues") && Array.isArray(resourcePayload.queues);
        const hasTopicsArray = !!resourcePayload && Object.prototype.hasOwnProperty.call(resourcePayload, "topics") && Array.isArray(resourcePayload.topics);
        setLivePlacementStatus(liveStatusNow);
        if (normalizedResources) {
          setClusterResources((prev) => ({
            hosts: normalizedResources.hosts.length ? normalizedResources.hosts : prev?.hosts ?? [],
            services: normalizedResources.services.length ? normalizedResources.services : prev?.services ?? [],
            placements:
              liveStatusNow === "unavailable"
                ? prev?.placements ?? normalizedResources.placements
                : normalizedResources.placements,
            queues: hasQueuesArray
              ? normalizedResources.queues
              : prev?.queues ?? normalizedResources.queues,
            topics: hasTopicsArray
              ? normalizedResources.topics
              : prev?.topics ?? normalizedResources.topics,
          }));
        }
        const metrics = dataPayload?.metrics ?? parsed.metrics;

        // Host-level metrics and resources from snapshot
        const metricsObj = asRecord(dataPayload?.metrics ?? parsed.metrics);
        const hostMetricsList = [
          ...(Array.isArray(dataPayload?.host_metrics) ? dataPayload.host_metrics : []),
          ...(Array.isArray(metricsObj?.host_metrics) ? metricsObj.host_metrics : []),
        ];
        if (Array.isArray(hostMetricsList) && hostMetricsList.length > 0) {
          const byHost: Record<string, { cpu_utilization?: number; memory_utilization?: number }> = {};
          for (const hm of hostMetricsList) {
            const rec = asRecord(hm);
            const id = str(rec?.host_id) ?? str(rec?.host);
            if (id) {
              const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
              byHost[id] = {
                cpu_utilization: num(rec?.cpu_utilization) ?? byHost[id]?.cpu_utilization,
                memory_utilization: num(rec?.memory_utilization) ?? byHost[id]?.memory_utilization,
              };
            }
          }
          if (Object.keys(byHost).length > 0) {
            setHostMetrics((prev) => ({ ...prev, ...byHost }));
          }
        }
        const hostsResource = normalizedResources?.hosts;
        if (Array.isArray(hostsResource) && hostsResource.length > 0) {
          const byHost: Record<string, { cpu_cores?: number; memory_gb?: number }> = {};
          for (const h of hostsResource) {
            const id = h?.host_id;
            if (id && typeof id === "string") {
              const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
              byHost[id] = { cpu_cores: num(h.cpu_cores), memory_gb: num(h.memory_gb) };
            }
          }
          if (Object.keys(byHost).length > 0) {
            setHostResources((prev) => ({ ...prev, ...byHost }));
          }
        }

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

        const summary: MetricsSummary = {
          ...(metrics as Record<string, unknown>),
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
          metrics: {
            ...(metrics as Record<string, unknown>),
            service_metrics: Array.isArray(list) ? list : undefined,
          },
        });
      } catch { /* malformed — ignore */ }
    }
  }, [runId]);

  const finalPlacementResources = useMemo<ClusterPlacementResources | null>(() => {
    const resolved = resolveFinalConfigForPlacement(
      metricsData?.summary as { final_config?: unknown } | undefined,
      runInfo?.metadata?.final_config,
    );
    const root = asRecord(resolved);
    if (!root) return null;
    const candidate = root.resources ?? root.cluster_resources ?? root;
    return normalizeClusterResources(candidate);
  }, [metricsData?.summary, runInfo?.metadata?.final_config]);

  const finalPlacementStatus = useMemo<PlacementStatus>(() => {
    const resolved = resolveFinalConfigForPlacement(
      metricsData?.summary as { final_config?: unknown } | undefined,
      runInfo?.metadata?.final_config,
    );
    const root = asRecord(resolved);
    if (!root) return "unavailable";
    const candidate = root.resources ?? root.cluster_resources ?? root;
    return placementStatusFromFinalConfig(candidate);
  }, [metricsData?.summary, runInfo?.metadata?.final_config]);

  const placementSource = useMemo<
    { sourceLabel: "live metrics_snapshot" | "final_config" | "unavailable"; mode: "live" | "final"; resources: ClusterPlacementResources | null; status: PlacementStatus }
  >(() => {
    const currentStatus = runInfo?.status ?? "pending";
    if (currentStatus === "running") {
      return {
        sourceLabel: livePlacementStatus === "unavailable" ? "unavailable" : "live metrics_snapshot",
        mode: "live",
        resources: clusterResources,
        status: livePlacementStatus,
      };
    }
    if (finalPlacementStatus !== "unavailable") {
      return {
        sourceLabel: "final_config",
        mode: "final",
        resources: finalPlacementResources,
        status: finalPlacementStatus,
      };
    }
    if (livePlacementStatus !== "unavailable") {
      return {
        sourceLabel: "live metrics_snapshot",
        mode: "final",
        resources: clusterResources,
        status: livePlacementStatus,
      };
    }
    return { sourceLabel: "unavailable", mode: "final", resources: null, status: "unavailable" };
  }, [runInfo?.status, livePlacementStatus, clusterResources, finalPlacementStatus, finalPlacementResources]);

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
      const data = (await res.json()) as DashboardMetricsResponse & Record<string, unknown>;
      if (Array.isArray(data.timeseries) && data.timeseries.length > 0) {
        const samples: UnscopedMetricDebugPoint[] = [];
        for (const ts of data.timeseries) {
          for (const p of ts.points ?? []) {
            const n = normalizePersistedMetricPoint(p, ts.metric);
            if (n && extractSeriesScopeFromNormalized(n) === "unscoped") {
              samples.push({
                source: "metrics.timeseries",
                metric: ts.metric,
                timestamp: n.timestamp,
                value: n.value,
                labels: p.labels as Record<string, string | undefined> | undefined,
                tags: p.tags,
                service_id: p.service_id,
                instance_id: p.instance_id,
                host_id: p.host_id,
                node_id: p.node_id,
              });
            }
          }
        }
        if (samples.length > 0) {
          setUnscopedMetricDebug((prev) => mergeUnscopedDebugPoints(prev, samples));
        }
      }
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
        ingress_requests:
          num(fromSummaryMetrics.ingress_requests) ??
          num(raw.ingress_requests) ??
          num(fromSummaryData.ingress_requests) ??
          num(fromTopLevel.ingress_requests),
        internal_requests:
          num(fromSummaryMetrics.internal_requests) ??
          num(raw.internal_requests) ??
          num(fromSummaryData.internal_requests) ??
          num(fromTopLevel.internal_requests),
        retry_attempts:
          num(fromSummaryMetrics.retry_attempts) ??
          num(raw.retry_attempts) ??
          num(fromSummaryData.retry_attempts) ??
          num(fromTopLevel.retry_attempts),
        attempt_error_rate:
          num(fromSummaryMetrics.attempt_error_rate) ??
          num(raw.attempt_error_rate) ??
          num(fromSummaryData.attempt_error_rate) ??
          num(fromTopLevel.attempt_error_rate),
        ingress_error_rate:
          num(fromSummaryMetrics.ingress_error_rate) ??
          num(raw.ingress_error_rate) ??
          num(fromSummaryData.ingress_error_rate) ??
          num(fromTopLevel.ingress_error_rate),
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
        queue_depth_sum:
          num(fromSummaryMetrics.queue_depth_sum) ??
          num(raw.queue_depth_sum) ??
          num(fromSummaryData.queue_depth_sum) ??
          num(fromTopLevel.queue_depth_sum),
        max_queue_depth:
          num(fromSummaryMetrics.max_queue_depth) ??
          num(raw.max_queue_depth) ??
          num(fromSummaryData.max_queue_depth) ??
          num(fromTopLevel.max_queue_depth),
        queue_oldest_message_age_ms:
          num(fromSummaryMetrics.queue_oldest_message_age_ms) ??
          num(raw.queue_oldest_message_age_ms) ??
          num(fromSummaryData.queue_oldest_message_age_ms) ??
          num(fromTopLevel.queue_oldest_message_age_ms),
        queue_drop_rate:
          num(fromSummaryMetrics.queue_drop_rate) ??
          num(raw.queue_drop_rate) ??
          num(fromSummaryData.queue_drop_rate) ??
          num(fromTopLevel.queue_drop_rate),
        queue_redelivery_count_total:
          num(fromSummaryMetrics.queue_redelivery_count_total) ??
          num(raw.queue_redelivery_count_total) ??
          num(fromSummaryData.queue_redelivery_count_total) ??
          num(fromTopLevel.queue_redelivery_count_total),
        queue_dlq_count_total:
          num(fromSummaryMetrics.queue_dlq_count_total) ??
          num(raw.queue_dlq_count_total) ??
          num(fromSummaryData.queue_dlq_count_total) ??
          num(fromTopLevel.queue_dlq_count_total),
        topic_backlog_depth_sum:
          num(fromSummaryMetrics.topic_backlog_depth_sum) ??
          num(raw.topic_backlog_depth_sum) ??
          num(fromSummaryData.topic_backlog_depth_sum) ??
          num(fromTopLevel.topic_backlog_depth_sum),
        topic_consumer_lag_sum:
          num(fromSummaryMetrics.topic_consumer_lag_sum) ??
          num(raw.topic_consumer_lag_sum) ??
          num(fromSummaryData.topic_consumer_lag_sum) ??
          num(fromTopLevel.topic_consumer_lag_sum),
        topic_oldest_message_age_ms:
          num(fromSummaryMetrics.topic_oldest_message_age_ms) ??
          num(raw.topic_oldest_message_age_ms) ??
          num(fromSummaryData.topic_oldest_message_age_ms) ??
          num(fromTopLevel.topic_oldest_message_age_ms),
        topic_drop_rate:
          num(fromSummaryMetrics.topic_drop_rate) ??
          num(raw.topic_drop_rate) ??
          num(fromSummaryData.topic_drop_rate) ??
          num(fromTopLevel.topic_drop_rate),
        locality_hit_rate:
          num(fromSummaryMetrics.locality_hit_rate) ??
          num(raw.locality_hit_rate) ??
          num(fromSummaryData.locality_hit_rate) ??
          num(fromTopLevel.locality_hit_rate),
        same_zone_request_count_total:
          num(fromSummaryMetrics.same_zone_request_count_total) ??
          num(raw.same_zone_request_count_total) ??
          num(fromSummaryData.same_zone_request_count_total) ??
          num(fromTopLevel.same_zone_request_count_total),
        cross_zone_request_count_total:
          num(fromSummaryMetrics.cross_zone_request_count_total) ??
          num(raw.cross_zone_request_count_total) ??
          num(fromSummaryData.cross_zone_request_count_total) ??
          num(fromTopLevel.cross_zone_request_count_total),
        cross_zone_request_fraction:
          num(fromSummaryMetrics.cross_zone_request_fraction) ??
          num(raw.cross_zone_request_fraction) ??
          num(fromSummaryData.cross_zone_request_fraction) ??
          num(fromTopLevel.cross_zone_request_fraction),
        cross_zone_latency_penalty_ms_total:
          num(fromSummaryMetrics.cross_zone_latency_penalty_ms_total) ??
          num(raw.cross_zone_latency_penalty_ms_total) ??
          num(fromSummaryData.cross_zone_latency_penalty_ms_total) ??
          num(fromTopLevel.cross_zone_latency_penalty_ms_total),
        cross_zone_latency_penalty_ms_mean:
          num(fromSummaryMetrics.cross_zone_latency_penalty_ms_mean) ??
          num(raw.cross_zone_latency_penalty_ms_mean) ??
          num(fromSummaryData.cross_zone_latency_penalty_ms_mean) ??
          num(fromTopLevel.cross_zone_latency_penalty_ms_mean),
        same_zone_latency_penalty_ms_total:
          num(fromSummaryMetrics.same_zone_latency_penalty_ms_total) ??
          num(raw.same_zone_latency_penalty_ms_total) ??
          num(fromSummaryData.same_zone_latency_penalty_ms_total) ??
          num(fromTopLevel.same_zone_latency_penalty_ms_total),
        same_zone_latency_penalty_ms_mean:
          num(fromSummaryMetrics.same_zone_latency_penalty_ms_mean) ??
          num(raw.same_zone_latency_penalty_ms_mean) ??
          num(fromSummaryData.same_zone_latency_penalty_ms_mean) ??
          num(fromTopLevel.same_zone_latency_penalty_ms_mean),
        external_latency_ms_total:
          num(fromSummaryMetrics.external_latency_ms_total) ??
          num(raw.external_latency_ms_total) ??
          num(fromSummaryData.external_latency_ms_total) ??
          num(fromTopLevel.external_latency_ms_total),
        external_latency_ms_mean:
          num(fromSummaryMetrics.external_latency_ms_mean) ??
          num(raw.external_latency_ms_mean) ??
          num(fromSummaryData.external_latency_ms_mean) ??
          num(fromTopLevel.external_latency_ms_mean),
        topology_latency_penalty_ms_total:
          num(fromSummaryMetrics.topology_latency_penalty_ms_total) ??
          num(raw.topology_latency_penalty_ms_total) ??
          num(fromSummaryData.topology_latency_penalty_ms_total) ??
          num(fromTopLevel.topology_latency_penalty_ms_total),
        topology_latency_penalty_ms_mean:
          num(fromSummaryMetrics.topology_latency_penalty_ms_mean) ??
          num(raw.topology_latency_penalty_ms_mean) ??
          num(fromSummaryData.topology_latency_penalty_ms_mean) ??
          num(fromTopLevel.topology_latency_penalty_ms_mean),
      };
      const serviceMetrics =
        data.metrics?.service_metrics ??
        (Array.isArray(fromSummaryMetrics.service_metrics) ? fromSummaryMetrics.service_metrics : undefined);
      const endpointRequestStats =
        data.metrics?.endpoint_request_stats ??
        (Array.isArray(fromSummaryMetrics.endpoint_request_stats) ? fromSummaryMetrics.endpoint_request_stats : undefined);
      const metricsPayload =
        serviceMetrics != null || endpointRequestStats != null
          ? {
              ...data.metrics,
              ...(serviceMetrics != null ? { service_metrics: serviceMetrics } : {}),
              ...(endpointRequestStats != null ? { endpoint_request_stats: endpointRequestStats } : {}),
            }
          : data.metrics;

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
      const data = (await res.json()) as { run_id?: string; points?: TimeseriesPoint[] };
      const points = data.points ?? [];
      const unscoped = points
        .map((p) => {
          const n = normalizePersistedMetricPoint(p, timeseriesApiMetric);
          return n ? { p, n } : null;
        })
        .filter((x): x is { p: TimeseriesPoint; n: NormalizedPersistedMetricPoint } => x != null && extractSeriesScopeFromNormalized(x.n) === "unscoped")
        .map(({ p, n }) => ({
          source: "metrics/timeseries" as const,
          metric: n.metric ?? timeseriesApiMetric,
          timestamp: n.timestamp,
          value: n.value,
          labels: p.labels,
          tags: p.tags,
          service_id: p.service_id,
          instance_id: p.instance_id,
          host_id: p.host_id,
          node_id: p.node_id,
        }));
      if (unscoped.length > 0) {
        setUnscopedMetricDebug((prev) => mergeUnscopedDebugPoints(prev, unscoped));
      }

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
              worker.postMessage({
                type: "processTimeseriesPoints",
                points,
                groupingLabel: timeseriesGroupBy,
                metric: timeseriesApiMetric,
              });
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
        const n = normalizePersistedMetricPoint(p, timeseriesApiMetric);
        if (!n) continue;
        const t = new Date(n.timestamp).getTime();
        if (!Number.isFinite(t)) continue;
        if (!rowMap[t]) rowMap[t] = { _t: t };
        if (timeseriesGroupBy !== "auto") {
          const scope = extractSeriesScopeByLabelFromNormalized(n, timeseriesGroupBy);
          const metric = n.metric ?? timeseriesApiMetric;
          const key = metric ? `${metric}:${scope}` : scope;
          rowMap[t][key] = n.value;
        } else {
          rowMap[t][flatTimeseriesSeriesKeyFromNormalized(n, timeseriesApiMetric)] = n.value;
        }
      }
      const rows: ChartRow[] = Object.values(rowMap).sort((a, b) => (a._t as number) - (b._t as number));
      setTimeseriesApiRows(rows);
    } catch (e) {
      setTimeseriesApiError((e as Error).message);
      setTimeseriesApiRows([]);
    } finally {
      setTimeseriesApiLoading(false);
    }
  }, [runId, timeseriesApiMetric, timeseriesGroupBy]);

  // Clear chart data, concurrent-requests, and host metrics state
  const clearChart = useCallback(() => {
    seriesSourceRef.current = {};
    seriesBufferRef.current = {};
    knownServicesRef.current.clear();
    setChartSeries({});
    concurrentByInstanceRef.current = {};
    setConcurrentRequestsByService({});
    setHostMetrics({});
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

  const applyServices = useCallback(async (
    serviceRows?: RuntimeServiceDraft[],
    replicasHint?: Record<string, number | undefined>,
    pendingTargets?: Record<string, { replicas: number; cpu_cores?: number; memory_mb?: number }>
  ): Promise<boolean> => {
    const config = liveConfig ?? DEFAULT_LIVE_CONFIG;
    const rows = serviceRows ?? config.services;
    if (!rows.length) return false;
    const replicasByServiceId: Record<string, number | undefined> = { ...(replicasHint ?? {}) };
    for (const step of [...optSteps].reverse()) {
      const services = step.current_config?.services ?? [];
      for (const svc of services) {
        if (typeof svc.id === "string" && typeof svc.replicas === "number" && Number.isFinite(svc.replicas)) {
          if (replicasByServiceId[svc.id] == null) replicasByServiceId[svc.id] = svc.replicas;
        }
      }
    }
    const metricsServiceSnapshots = (liveMetricsData ?? metricsData)?.metrics?.service_metrics ?? [];
    for (const svc of metricsServiceSnapshots) {
      if (svc.service_name && typeof svc.active_replicas === "number" && Number.isFinite(svc.active_replicas)) {
        if (replicasByServiceId[svc.service_name] == null) replicasByServiceId[svc.service_name] = svc.active_replicas;
      }
    }
    const model = onlineConfigModelRef.current;
    if (!model) {
      setConfigUpdateError("Online config model is not ready yet. Please retry.");
      return false;
    }
    const payload = buildServicePatchPayloadFromModel(model, rows, replicasByServiceId);
    if (!payload.ok) {
      setConfigUpdateError(payload.error);
      return false;
    }
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      await patchRunConfiguration(runId, { services: payload.value });
      if (pendingTargets && Object.keys(pendingTargets).length > 0) {
        setPendingServiceObservationById((prev) => {
          const next = { ...prev };
          const now = Date.now();
          for (const [id, target] of Object.entries(pendingTargets)) {
            next[id] = { ...target, updatedAt: now };
          }
          return next;
        });
      }
      return true;
    } catch (e) {
      if (pendingTargets && Object.keys(pendingTargets).length > 0) {
        setPendingServiceObservationById((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(pendingTargets)) delete next[id];
          return next;
        });
      }
      setConfigUpdateError((e as Error).message);
      return false;
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig?.services, optSteps, liveMetricsData, metricsData]);

  const applyWorkload = useCallback(async (
    workloadRows?: PatchRunConfigurationWorkloadItem[],
    pendingTargets?: Record<string, { rate_rps: number }>
  ): Promise<boolean> => {
    const config = liveConfig ?? DEFAULT_LIVE_CONFIG;
    const rows = workloadRows ?? config.workload;
    if (!rows.length) return false;
    const model = onlineConfigModelRef.current;
    if (!model) {
      setConfigUpdateError("Online config model is not ready yet. Please retry.");
      return false;
    }
    const payload = buildWorkloadPatchPayloadFromModel(model, rows);
    if (!payload.ok) {
      setConfigUpdateError(payload.error);
      return false;
    }
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      if (payload.value.length === 1) {
        const { pattern_key, rate_rps } = payload.value[0];
        await patchRunWorkload(runId, { pattern_key, rate_rps });
      } else {
        await patchRunConfiguration(runId, { workload: payload.value });
      }
      if (pendingTargets && Object.keys(pendingTargets).length > 0) {
        setPendingTrafficObservationByPattern((prev) => {
          const next = { ...prev };
          const now = Date.now();
          for (const [patternKey, target] of Object.entries(pendingTargets)) {
            next[patternKey] = { ...target, updatedAt: now };
          }
          return next;
        });
      }
      return true;
    } catch (e) {
      if (pendingTargets && Object.keys(pendingTargets).length > 0) {
        setPendingTrafficObservationByPattern((prev) => {
          const next = { ...prev };
          for (const patternKey of Object.keys(pendingTargets)) delete next[patternKey];
          return next;
        });
      }
      setConfigUpdateError((e as Error).message);
      return false;
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig?.workload]);

  const applyPolicies = useCallback(async () => {
    const config = liveConfig ?? DEFAULT_LIVE_CONFIG;
    const policies = config.policies ?? { autoscaling: { enabled: false, target_cpu_util: 70, scale_step: 1 } };
    if (!policies.autoscaling) return;
    const model = onlineConfigModelRef.current;
    if (!model) {
      setConfigUpdateError("Online config model is not ready yet. Please retry.");
      return;
    }
    const payload = buildPoliciesPatchPayloadFromModel(model, policies);
    if (!payload.ok) {
      setConfigUpdateError(payload.error);
      return;
    }
    setConfigUpdateLoading(true);
    setConfigUpdateError(null);
    try {
      await patchRunConfiguration(runId, { policies: payload.value });
    } catch (e) {
      setConfigUpdateError((e as Error).message);
    } finally {
      setConfigUpdateLoading(false);
    }
  }, [runId, liveConfig]);

  const handleManualLeaseRenew = useCallback(async () => {
    setManualLeaseRenewLoading(true);
    try {
      await renewOnlineLease(runId);
      setLeaseRenewError(null);
      setLeaseRenewStatus("ok");
      const currentLeaseTtlMs =
        typeof runInfo?.metadata?.lease_ttl_ms === "number" && runInfo.metadata.lease_ttl_ms > 0
          ? runInfo.metadata.lease_ttl_ms
          : undefined;
      if (currentLeaseTtlMs != null) {
        const period = Math.min(
          Math.max(Math.floor(currentLeaseTtlMs * 0.45), 5_000),
          Math.max(currentLeaseTtlMs - 2_000, 5_000),
        );
        nextLeaseRenewAtRef.current = Date.now() + period;
      }
    } catch (e) {
      setLeaseRenewError(e instanceof Error ? e.message : String(e));
      setLeaseRenewStatus("error");
    } finally {
      setManualLeaseRenewLoading(false);
    }
  }, [runId, runInfo?.metadata]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const status = runInfo?.status ?? "pending";
  const runName = (runInfo?.metadata?.name as string | undefined) ?? runId;
  const statusStyle = STATUS_STYLES[status] ?? "text-white/60 bg-white/10 border-white/10";
  const isTerminal = ["completed", "failed", "cancelled", "stopped"].includes(status);
  const selectedTimeseriesMetricMeta =
    TIMESERIES_METRIC_OPTIONS.find((m) => m.value === timeseriesApiMetric) ??
    {
      value: timeseriesApiMetric,
      label: timeseriesApiMetric,
      unit: "raw" as TimeseriesMetricUnit,
      behavior: "observation" as TimeseriesMetricBehavior,
      description: "No metadata available for this metric.",
    };

  useEffect(() => {
    if (isTerminal) setOptProgressHint(null);
  }, [isTerminal]);

  const isOnlineMode =
    status === "running" &&
    (runInfo?.metadata?.mode === "online" || runInfo?.metadata?.mode === "online_optimization");
  const leaseTtlMs =
    typeof runInfo?.metadata?.lease_ttl_ms === "number" && runInfo.metadata.lease_ttl_ms > 0
      ? runInfo.metadata.lease_ttl_ms
      : undefined;

  useEffect(() => {
    if (status !== "running" || !isOnlineMode || leaseTtlMs == null) {
      nextLeaseRenewAtRef.current = null;
      return;
    }
    const period = Math.min(
      Math.max(Math.floor(leaseTtlMs * 0.45), 5_000),
      Math.max(leaseTtlMs - 2_000, 5_000),
    );
    const tick = () => {
      nextLeaseRenewAtRef.current = Date.now() + period;
      renewOnlineLease(runId)
        .then(() => {
          setLeaseRenewError(null);
          setLeaseRenewStatus("ok");
        })
        .catch((e: unknown) => {
          setLeaseRenewError(e instanceof Error ? e.message : String(e));
          setLeaseRenewStatus("error");
        });
    };
    tick();
    const timer = window.setInterval(tick, period);
    return () => window.clearInterval(timer);
  }, [runId, status, isOnlineMode, leaseTtlMs]);

  const showMetricsSection = (status === "running" && liveMetricsData) || isTerminal;
  const displayMetrics = status === "running" && liveMetricsData ? liveMetricsData : metricsData;
  const messagingResources = placementSource.resources;
  const queueResources = messagingResources?.queues ?? [];
  const topicResources = messagingResources?.topics ?? [];

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
    if (!isOnlineMode) setControlRoomTab("services");
  }, [isOnlineMode]);
  useEffect(() => {
    setLiveConfig(null);
    setServiceMixerDrafts({});
    setTrafficConsoleDrafts({});
    setPendingServiceObservationById({});
    setPendingTrafficObservationByPattern({});
    setConfigUpdateError(null);
    setLeaseRenewStatus("idle");
    setControlRoomTab("services");
  }, [runId]);

  // In online mode, seed default config so user can add services/workload and apply even before first optimization step
  useEffect(() => {
    if (isOnlineMode && liveConfig === null) setLiveConfig({ ...DEFAULT_LIVE_CONFIG });
  }, [isOnlineMode, liveConfig]);

  // Parse scenario YAML to extract workload pattern keys and service IDs for dropdowns (from existing run)
  const runDerivedOptions = useMemo(() => {
    const patternKeys: string[] = [];
    const serviceIds: string[] = [];
    // From run response configuration (if backend returns it)
    const runConfig = runInfo?.configuration;
    if (runConfig?.workload) {
      for (const w of runConfig.workload) {
        const key = (w as { pattern_key?: string }).pattern_key;
        if (key && typeof key === "string") patternKeys.push(key);
      }
    }
    if (runConfig?.services) {
      for (const s of runConfig.services) {
        const id = (s as { id?: string }).id;
        if (id && typeof id === "string") serviceIds.push(id);
      }
    }
    // From scenario YAML (fallback when run doesn't include configuration)
    if (scenarioYaml) {
      try {
        const parsed = YAML.parse(scenarioYaml) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          const wl = parsed.workload ?? (parsed as Record<string, unknown>).workload_patterns;
          if (Array.isArray(wl)) {
            for (const item of wl) {
              if (item && typeof item === "object" && "pattern_key" in item) {
                const k = (item as { pattern_key?: string }).pattern_key;
                if (k && typeof k === "string") patternKeys.push(k);
              } else if (typeof item === "string") {
                patternKeys.push(item);
              }
            }
          }
          const topo = (parsed as Record<string, unknown>).topology as Record<string, unknown> | undefined;
          const svcs = (parsed as Record<string, unknown>).services ?? topo?.services ?? (parsed as Record<string, unknown>).services;
          if (Array.isArray(svcs)) {
            for (const s of svcs) {
              if (s && typeof s === "object" && "id" in s) {
                const id = (s as { id?: string }).id;
                if (id && typeof id === "string") serviceIds.push(id);
              }
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    return {
      patternKeys: Array.from(new Set(patternKeys)).sort(),
      serviceIds: Array.from(new Set(serviceIds)).sort(),
    };
  }, [runInfo?.configuration, scenarioYaml]);

  const onlineConfigModel: OnlineConfigModel = useMemo(() => {
    const latestStepConfig =
      [...optSteps].reverse().find((step) => step.current_config != null)?.current_config ?? null;
    return buildOnlineConfigModel({
      runMetadata:
        runInfo?.metadata && typeof runInfo.metadata === "object"
          ? (runInfo.metadata as Record<string, unknown>)
          : null,
      latestOptimizationConfig: latestStepConfig,
      latestResources: placementSource.resources ?? null,
      scenarioServiceIds: runDerivedOptions.serviceIds,
      scenarioWorkloadPatternKeys: runDerivedOptions.patternKeys,
      leaseState: {
        autoRenewEnabled: status === "running" && isOnlineMode && leaseTtlMs != null,
        lastRenewalStatus: leaseRenewStatus,
        lastRenewalError: leaseRenewError,
        nextRenewalAtMs: nextLeaseRenewAtRef.current,
      },
    });
  }, [
    optSteps,
    runInfo?.metadata,
    placementSource.resources,
    runDerivedOptions.serviceIds,
    runDerivedOptions.patternKeys,
    status,
    isOnlineMode,
    leaseTtlMs,
    leaseRenewStatus,
    leaseRenewError,
  ]);
  useEffect(() => {
    onlineConfigModelRef.current = onlineConfigModel;
  }, [onlineConfigModel]);

  const observedServicesById = useMemo<Record<string, ObservedServiceRuntime>>(() => {
    const out: Record<string, ObservedServiceRuntime> = {};
    const ensure = (id: string) => {
      const key = id.trim();
      if (!key) return;
      if (!out[key]) out[key] = { id: key };
    };
    for (const id of runDerivedOptions.serviceIds) ensure(id);
    for (const s of runInfo?.configuration?.services ?? []) {
      if (typeof s.id === "string") ensure(s.id);
    }
    const latestStepServices =
      [...optSteps].reverse().find((step) => Array.isArray(step.current_config?.services))?.current_config?.services ?? [];
    for (const s of latestStepServices) {
      if (typeof s.id !== "string") continue;
      ensure(s.id);
      if (typeof s.replicas === "number" && Number.isFinite(s.replicas)) out[s.id].replicas = s.replicas;
      if (typeof s.cpu_cores === "number" && Number.isFinite(s.cpu_cores)) out[s.id].cpu_cores = s.cpu_cores;
      if (typeof s.memory_mb === "number" && Number.isFinite(s.memory_mb)) out[s.id].memory_mb = s.memory_mb;
    }
    const resources = placementSource.resources;
    const placementCounts: Record<string, number> = {};
    for (const p of resources?.placements ?? []) {
      if (!p.service_id) continue;
      ensure(p.service_id);
      placementCounts[p.service_id] = (placementCounts[p.service_id] ?? 0) + 1;
    }
    for (const s of resources?.services ?? []) {
      ensure(s.service_id);
      if (typeof s.replicas === "number" && Number.isFinite(s.replicas)) out[s.service_id].replicas = s.replicas;
      if (typeof s.cpu_cores === "number" && Number.isFinite(s.cpu_cores)) out[s.service_id].cpu_cores = s.cpu_cores;
      if (typeof s.memory_mb === "number" && Number.isFinite(s.memory_mb)) out[s.service_id].memory_mb = s.memory_mb;
    }
    for (const [id, count] of Object.entries(placementCounts)) {
      if (out[id] && out[id].replicas == null) out[id].replicas = count;
    }
    for (const sm of displayMetrics?.metrics?.service_metrics ?? []) {
      if (!sm.service_name) continue;
      ensure(sm.service_name);
      if (typeof sm.active_replicas === "number" && Number.isFinite(sm.active_replicas) && out[sm.service_name].replicas == null) {
        out[sm.service_name].replicas = sm.active_replicas;
      }
      if (typeof sm.cpu_utilization === "number" && Number.isFinite(sm.cpu_utilization)) {
        out[sm.service_name].cpu_utilization = sm.cpu_utilization;
      }
      if (typeof sm.memory_utilization === "number" && Number.isFinite(sm.memory_utilization)) {
        out[sm.service_name].memory_utilization = sm.memory_utilization;
      }
    }
    return out;
  }, [runDerivedOptions.serviceIds, runInfo?.configuration?.services, optSteps, placementSource.resources, displayMetrics?.metrics?.service_metrics]);

  useEffect(() => {
    setPendingServiceObservationById((prev) => {
      const next = { ...prev };
      for (const [id, target] of Object.entries(prev)) {
        const observed = observedServicesById[id];
        if (!observed) continue;
        const replicasMatch = observed.replicas === target.replicas;
        const cpuMatch = target.cpu_cores == null || observed.cpu_cores === target.cpu_cores;
        const memMatch = target.memory_mb == null || observed.memory_mb === target.memory_mb;
        if (replicasMatch && cpuMatch && memMatch) delete next[id];
      }
      return next;
    });
  }, [observedServicesById]);

  const observedTrafficByPattern = useMemo<Record<string, ObservedTrafficLane>>(() => {
    const out: Record<string, ObservedTrafficLane> = {};
    const ensure = (patternKey: string) => {
      const key = patternKey.trim();
      if (!key) return;
      if (!out[key]) out[key] = { pattern_key: key };
    };
    for (const key of runDerivedOptions.patternKeys) ensure(key);
    for (const w of runInfo?.configuration?.workload ?? []) {
      if (typeof w.pattern_key !== "string") continue;
      ensure(w.pattern_key);
      if (typeof w.rate_rps === "number" && Number.isFinite(w.rate_rps)) {
        out[w.pattern_key].observed_rate_rps = w.rate_rps;
      }
    }
    const latestStepWorkload =
      [...optSteps].reverse().find((step) => Array.isArray(step.current_config?.workload))?.current_config?.workload ?? [];
    for (const w of latestStepWorkload) {
      const record = asRecord(w);
      if (!record) continue;
      const patternKey = str(record.pattern_key);
      const rateRps = num(record.rate_rps);
      if (!patternKey) continue;
      ensure(patternKey);
      if (rateRps != null) out[patternKey].observed_rate_rps = rateRps;
    }
    return out;
  }, [runDerivedOptions.patternKeys, runInfo?.configuration?.workload, optSteps]);

  useEffect(() => {
    setPendingTrafficObservationByPattern((prev) => {
      const next = { ...prev };
      for (const [patternKey, target] of Object.entries(prev)) {
        const observed = observedTrafficByPattern[patternKey];
        if (!observed || observed.observed_rate_rps == null) continue;
        if (observed.observed_rate_rps === target.rate_rps) delete next[patternKey];
      }
      return next;
    });
  }, [observedTrafficByPattern]);

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
        {leaseRenewError && isOnlineMode && (
          <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Lease renewal: {leaseRenewError}
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

            {/* Optimization summary (engine callback merge on run.metadata) */}
            {runInfo.metadata &&
              (() => {
                const m = runInfo.metadata;
                const showSummary =
                  m.best_score != null ||
                  m.iterations != null ||
                  m.best_run_id != null ||
                  (Array.isArray(m.top_candidates) && m.top_candidates.length > 0) ||
                  (Array.isArray(m.candidate_run_ids) && m.candidate_run_ids.length > 0) ||
                  (m.best_candidate_metrics != null && typeof m.best_candidate_metrics === "object") ||
                  m.configuration_before != null ||
                  m.configuration_after != null ||
                  m.online_completion_reason != null ||
                  m.final_config != null ||
                  isBatchOptimizationMeta(m);
                if (!showSummary) return null;
                const batchMode = isBatchOptimizationMeta(m);
                const fmtScore = (v: unknown, objective?: string) => {
                  if (typeof v !== "number") return String(v);
                  return objective === "cpu_utilization" || objective === "memory_utilization"
                    ? `${(v * 100).toFixed(2)}%`
                    : v.toFixed(4);
                };
                return (
                  <div className="border-t border-border pt-4">
                    <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">
                      Optimization summary
                    </h3>
                    {batchMode ? (
                      <div className="space-y-3 text-xs">
                        <p className="text-white/45">
                          Batch search: interpret feasibility, violation, and efficiency —{" "}
                          <span className="text-amber-200/90">best_score</span> is a legacy efficiency-only field, not the full winner score.
                        </p>
                        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                          {typeof m.batch_recommendation_feasible === "boolean" && (
                            <div>
                              <dt className="text-white/40 mb-0.5">Feasible</dt>
                              <dd className="text-white/80">{m.batch_recommendation_feasible ? "Yes" : "No"}</dd>
                            </div>
                          )}
                          {m.batch_violation_score != null && (
                            <div>
                              <dt className="text-white/40 mb-0.5">Violation score</dt>
                              <dd className="font-mono text-white/80">{String(m.batch_violation_score)}</dd>
                            </div>
                          )}
                          {m.batch_efficiency_score != null && (
                            <div>
                              <dt className="text-white/40 mb-0.5">Efficiency score</dt>
                              <dd className="font-mono text-white/80">{String(m.batch_efficiency_score)}</dd>
                            </div>
                          )}
                          {m.best_score != null && (
                            <div>
                              <dt className="text-white/40 mb-0.5">best_score (legacy)</dt>
                              <dd className="font-mono text-white/70">{fmtScore(m.best_score, m.objective)}</dd>
                            </div>
                          )}
                          {m.iterations != null && (
                            <div>
                              <dt className="text-white/40 mb-0.5">Evaluations / iterations</dt>
                              <dd className="font-mono text-white/80">{String(m.iterations)}</dd>
                            </div>
                          )}
                          {m.objective && (
                            <div>
                              <dt className="text-white/40 mb-0.5">Objective</dt>
                              <dd className="text-white/80">{String(m.objective)}</dd>
                            </div>
                          )}
                          {m.best_run_id && (
                            <div className="md:col-span-2">
                              <dt className="text-white/40 mb-0.5">Best run ID</dt>
                              <dd className="font-mono text-white/70 break-all text-[10px]">{String(m.best_run_id)}</dd>
                            </div>
                          )}
                          {Array.isArray(m.candidate_run_ids) && m.candidate_run_ids.length > 0 && (
                            <div className="col-span-2 md:col-span-4">
                              <dt className="text-white/40 mb-1">Candidate run IDs</dt>
                              <dd className="flex flex-wrap gap-1.5">
                                {(m.candidate_run_ids as string[]).map((id) => (
                                  <span
                                    key={id}
                                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-200 border border-slate-500/25"
                                    title={id}
                                  >
                                    {id}
                                  </span>
                                ))}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {(() => {
                          const bestCand = candidates?.find((c) => m.best_run_id && c.id === m.best_run_id);
                          const fromMeta =
                            m.best_candidate_metrics && typeof m.best_candidate_metrics === "object"
                              ? (m.best_candidate_metrics as Record<string, unknown>)
                              : null;
                          const fromBreakdown =
                            m.batch_score_breakdown &&
                            typeof m.batch_score_breakdown === "object" &&
                            (m.batch_score_breakdown as Record<string, unknown>).best_candidate_metrics != null
                              ? ((m.batch_score_breakdown as Record<string, unknown>).best_candidate_metrics as Record<
                                  string,
                                  unknown
                                >)
                              : null;
                          const fromCandidate = bestCand?.metrics as Record<string, unknown> | undefined;
                          const merged = { ...fromCandidate, ...fromBreakdown, ...fromMeta };
                          const keys = Object.keys(merged).filter((k) => merged[k] != null);
                          if (keys.length === 0) return null;
                          const label = (k: string) =>
                            k
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase());
                          return (
                            <div>
                              <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2">
                                Best candidate metrics
                              </h4>
                              <dl className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                                {keys.map((k) => (
                                  <div key={k}>
                                    <dt className="text-white/35 mb-0.5">{label(k)}</dt>
                                    <dd className="font-mono text-white/85">
                                      {typeof merged[k] === "number" ? String(merged[k]) : JSON.stringify(merged[k])}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          );
                        })()}
                        {(() => {
                          const bd = m.batch_score_breakdown as Record<string, unknown> | undefined;
                          const b =
                            m.configuration_before ??
                            (bd && typeof bd.configuration_before !== "undefined" ? bd.configuration_before : undefined);
                          const a =
                            m.configuration_after ??
                            (bd && typeof bd.configuration_after !== "undefined" ? bd.configuration_after : undefined);
                          if (b == null && a == null) return null;
                          const fmt = (v: unknown) =>
                            typeof v === "string" ? v : JSON.stringify(v, null, 2);
                          return (
                            <div>
                              <h4 className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2">
                                Configuration before / after
                              </h4>
                              <div className="grid md:grid-cols-2 gap-2 text-[10px]">
                                <div>
                                  <div className="text-white/40 mb-1">Before</div>
                                  <pre className="p-2 rounded border border-border bg-black/30 overflow-x-auto max-h-56 text-white/70">
                                    {b != null ? fmt(b) : "—"}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-white/40 mb-1">After (recommended)</div>
                                  <pre className="p-2 rounded border border-emerald-500/20 bg-emerald-500/5 overflow-x-auto max-h-56 text-white/80">
                                    {a != null ? fmt(a) : "—"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        {typeof m.batch_recommendation_summary === "string" && m.batch_recommendation_summary.trim() !== "" && (
                          <div>
                            <dt className="text-white/40 mb-1">Summary</dt>
                            <dd className="text-white/80 whitespace-pre-wrap">{m.batch_recommendation_summary}</dd>
                          </div>
                        )}
                        {m.batch_score_breakdown != null && typeof m.batch_score_breakdown === "object" && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-white/50 hover:text-white/70">Score breakdown (JSON)</summary>
                            <pre className="mt-2 p-2 rounded border border-border bg-black/30 text-[10px] overflow-x-auto">
                              {JSON.stringify(m.batch_score_breakdown, null, 2)}
                            </pre>
                          </details>
                        )}
                        {m.top_candidates && Array.isArray(m.top_candidates) && m.top_candidates.length > 0 && (
                          <div>
                            <dt className="text-white/40 mb-1">Top candidates (score-ordered)</dt>
                            <dd className="flex flex-wrap gap-1.5">
                              {(m.top_candidates as string[]).map((id, i) => (
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
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                        {m.iterations != null && (
                          <div>
                            <dt className="text-white/40 mb-0.5">Iterations</dt>
                            <dd className="text-white/80 font-mono">{String(m.iterations)}</dd>
                          </div>
                        )}
                        {m.best_score != null && (
                          <div>
                            <dt className="text-white/40 mb-0.5">Best score</dt>
                            <dd className="text-white/80 font-mono">{fmtScore(m.best_score, m.objective)}</dd>
                          </div>
                        )}
                        {m.objective && (
                          <div>
                            <dt className="text-white/40 mb-0.5">Objective</dt>
                            <dd className="text-white/80">{String(m.objective)}</dd>
                          </div>
                        )}
                        {m.online_completion_reason && (
                          <div className="md:col-span-2">
                            <dt className="text-white/40 mb-0.5">Online completion reason</dt>
                            <dd className="text-white/80">{String(m.online_completion_reason)}</dd>
                          </div>
                        )}
                        {m.final_config != null && (
                          <div className="col-span-2 md:col-span-4">
                            <dt className="text-white/40 mb-1">Final config</dt>
                            <pre className="text-[10px] font-mono text-white/70 bg-black/30 border border-border rounded p-2 overflow-x-auto max-h-48">
                              {typeof m.final_config === "string"
                                ? m.final_config
                                : JSON.stringify(m.final_config, null, 2)}
                            </pre>
                          </div>
                        )}
                        {m.best_run_id && (
                          <div>
                            <dt className="text-white/40 mb-0.5">Best run ID</dt>
                            <dd className="font-mono text-white/70 break-all text-[10px]">{String(m.best_run_id)}</dd>
                          </div>
                        )}
                        {m.top_candidates && Array.isArray(m.top_candidates) && m.top_candidates.length > 0 && (
                          <div className="col-span-2 md:col-span-4">
                            <dt className="text-white/40 mb-1">Top candidates</dt>
                            <dd className="flex flex-wrap gap-1.5">
                              {(m.top_candidates as string[]).map((id, i) => (
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
                    )}
                  </div>
                );
              })()}
          </>
        ) : null}
      </div>

      {/* Online Control Room — online mode only */}
      {isOnlineMode && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-white">Online Control Room</h2>
              <p className="text-xs text-white/40 mt-1">Runtime controls, lease state, and locked creation settings.</p>
            </div>
            <div className="text-[10px] text-white/35 font-mono">run_id scoped · SSE-confirmed runtime state</div>
          </div>
          {configUpdateError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {configUpdateError}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "services", label: "Services", icon: Settings2 },
              { id: "traffic", label: "Traffic", icon: Route },
              { id: "autoscaling", label: "Autoscaling", icon: SlidersHorizontal },
              { id: "lease", label: "Lease", icon: Clock3 },
              { id: "locked", label: "Locked Settings", icon: Lock },
              { id: "change_log", label: "Change Log", icon: History },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = controlRoomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setControlRoomTab(tab.id as typeof controlRoomTab)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/15 bg-black/20 text-white/65 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {(() => {
            const config = liveConfig ?? DEFAULT_LIVE_CONFIG;
            const serviceIdsFromRun = new Set(runDerivedOptions.serviceIds);
            const serviceIdsFromSteps = new Set(
              optSteps.flatMap((step) => (step.current_config?.services ?? []).map((svc) => svc.id).filter(Boolean))
            );
            const serviceIdsFromConfig = new Set(config.services.map((s) => s.id).filter(Boolean));
            const serviceIdsFromMetrics = new Set(
              (displayMetrics?.metrics?.service_metrics ?? []).map((sm) => sm.service_name).filter(Boolean)
            );
            const knownServiceIds = Array.from(
              new Set([...serviceIdsFromRun, ...serviceIdsFromSteps, ...serviceIdsFromConfig, ...serviceIdsFromMetrics])
            ).sort();
            const patternKeysFromRun = new Set(runDerivedOptions.patternKeys);
            const patternKeysFromSteps = new Set(
              optSteps.flatMap((step) => {
                const wl = step.current_config?.workload;
                if (!Array.isArray(wl)) return [];
                return wl
                  .filter((w): w is { pattern_key?: string } => typeof w === "object" && w != null && "pattern_key" in w)
                  .map((w) => w.pattern_key)
                  .filter(Boolean);
              })
            );
            const patternKeysFromConfig = new Set(config.workload.map((w) => w.pattern_key).filter(Boolean));
            const knownPatternKeys = Array.from(
              new Set([...patternKeysFromRun, ...patternKeysFromSteps, ...patternKeysFromConfig])
            ).sort();

            const autoscaling = config.policies?.autoscaling ?? {
              enabled: false,
              target_cpu_util: 70,
              scale_step: 1,
            };
            const targetCpuPercent =
              autoscaling.target_cpu_util == null
                ? 70
                : autoscaling.target_cpu_util <= 1
                  ? autoscaling.target_cpu_util * 100
                  : autoscaling.target_cpu_util;

            const lockedFields = onlineConfigModel.byGroup.createTimeLocked.filter((f) => f.observedValue != null);
            const recentSteps = [...optSteps]
              .sort((a, b) => (a.iteration_index ?? Number.MAX_SAFE_INTEGER) - (b.iteration_index ?? Number.MAX_SAFE_INTEGER))
              .slice(-8);
            const observedAndDraftServiceIds = Array.from(
              new Set([...Object.keys(observedServicesById), ...Object.keys(serviceMixerDrafts)])
            ).sort((a, b) => a.localeCompare(b));
            const serviceReplicaHints = Object.fromEntries(
              Object.values(observedServicesById).map((s) => [s.id, s.replicas])
            );
            const dirtyInvalidServiceIds = observedAndDraftServiceIds.filter((serviceId) => {
              const observed = observedServicesById[serviceId] ?? { id: serviceId };
              const draft = serviceMixerDrafts[serviceId] ?? {};
              const draftId = (draft.id ?? observed.id).toString().trim();
              const effectiveReplicas = draft.replicas ?? observed.replicas;
              const effectiveCpu = draft.cpu_cores ?? observed.cpu_cores;
              const effectiveMem = draft.memory_mb ?? observed.memory_mb;
              const dirty =
                (draft.id ?? undefined) !== undefined && draftId !== observed.id ||
                draft.replicas !== undefined && draft.replicas !== observed.replicas ||
                draft.cpu_cores !== undefined && draft.cpu_cores !== observed.cpu_cores ||
                draft.memory_mb !== undefined && draft.memory_mb !== observed.memory_mb;
              if (!dirty) return false;
              const rowDraft: RuntimeServiceDraft = {
                id: draftId || observed.id,
                replicas: effectiveReplicas,
                cpu_cores: draft.cpu_cores !== undefined ? effectiveCpu : undefined,
                memory_mb: draft.memory_mb !== undefined ? effectiveMem : undefined,
              };
              const rowValidation = buildServicePatchPayloadFromModel(onlineConfigModel, [rowDraft], serviceReplicaHints);
              return !rowValidation.ok;
            });
            const dirtyInvalidCount = dirtyInvalidServiceIds.length;
            const observedAndDraftPatternKeys = Array.from(
              new Set([...Object.keys(observedTrafficByPattern), ...Object.keys(trafficConsoleDrafts)])
            ).sort((a, b) => a.localeCompare(b));
            const dirtyInvalidTrafficKeys = observedAndDraftPatternKeys.filter((patternKey) => {
              const observed = observedTrafficByPattern[patternKey] ?? { pattern_key: patternKey };
              const draft = trafficConsoleDrafts[patternKey] ?? {};
              const draftPatternKey = (draft.pattern_key ?? observed.pattern_key).toString().trim();
              const effectiveRate = draft.rate_rps ?? observed.observed_rate_rps;
              const dirty =
                (draft.pattern_key ?? undefined) !== undefined && draftPatternKey !== observed.pattern_key ||
                draft.rate_rps !== undefined && draft.rate_rps !== observed.observed_rate_rps;
              if (!dirty) return false;
              const rowDraft: PatchRunConfigurationWorkloadItem = {
                pattern_key: draftPatternKey || observed.pattern_key,
                rate_rps: effectiveRate ?? 0,
              };
              const rowValidation = buildWorkloadPatchPayloadFromModel(onlineConfigModel, [rowDraft]);
              return !rowValidation.ok;
            });
            const dirtyInvalidTrafficCount = dirtyInvalidTrafficKeys.length;
            const liveThroughputRps = num(displayMetrics?.summary?.throughput_rps);
            const liveRequestCount =
              num(displayMetrics?.summary?.request_count) ??
              num(displayMetrics?.summary?.total_requests);

            return (
              <>
                {controlRoomTab === "services" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Services</h3>
                      <span className="text-[10px] text-white/30 font-mono">PATCH /configuration</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const candidate =
                              knownServiceIds.find((id): id is string => typeof id === "string" && !serviceMixerDrafts[id]) ??
                              (typeof knownServiceIds[0] === "string" ? knownServiceIds[0] : undefined);
                            if (!candidate) return;
                            setServiceMixerDrafts((prev) => ({ ...prev, [candidate]: { id: candidate, replicas: 1 } }));
                          }}
                          className="px-2 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add service
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const observedServices = observedAndDraftServiceIds.map((serviceId) => observedServicesById[serviceId] ?? { id: serviceId });
                            const replicasById: Record<string, number | undefined> = {};
                            for (const svc of observedServices) replicasById[svc.id] = svc.replicas;
                            const changedRows: RuntimeServiceDraft[] = [];
                            const pendingTargets: Record<string, { replicas: number; cpu_cores?: number; memory_mb?: number }> = {};
                            const invalidDirtyRows: string[] = [];
                            for (const observed of observedServices) {
                              const draft = serviceMixerDrafts[observed.id] ?? {};
                              const draftId = (draft.id ?? observed.id ?? "").toString().trim();
                              const effectiveReplicas = draft.replicas ?? observed.replicas;
                              const effectiveCpu = draft.cpu_cores ?? observed.cpu_cores;
                              const effectiveMem = draft.memory_mb ?? observed.memory_mb;
                              const dirty =
                                (draft.id ?? undefined) !== undefined && draftId !== observed.id ||
                                draft.replicas !== undefined && draft.replicas !== observed.replicas ||
                                draft.cpu_cores !== undefined && draft.cpu_cores !== observed.cpu_cores ||
                                draft.memory_mb !== undefined && draft.memory_mb !== observed.memory_mb;
                              if (!dirty) continue;
                              const row: RuntimeServiceDraft = {
                                id: draftId || observed.id,
                                replicas: effectiveReplicas,
                                cpu_cores: draft.cpu_cores !== undefined ? effectiveCpu : undefined,
                                memory_mb: draft.memory_mb !== undefined ? effectiveMem : undefined,
                              };
                              const rowValidation = buildServicePatchPayloadFromModel(onlineConfigModel, [row], replicasById);
                              if (!rowValidation.ok) {
                                invalidDirtyRows.push(observed.id);
                                continue;
                              }
                              changedRows.push(row);
                              if (typeof row.id === "string" && row.id.trim() !== "" && typeof row.replicas === "number") {
                                pendingTargets[row.id] = {
                                  replicas: row.replicas,
                                  cpu_cores: row.cpu_cores,
                                  memory_mb: row.memory_mb,
                                };
                              }
                            }
                            if (invalidDirtyRows.length > 0) return;
                            if (changedRows.length === 0) return;
                            const ok = await applyServices(changedRows, replicasById, pendingTargets);
                            if (ok) {
                              setServiceMixerDrafts((prev) => {
                                const next = { ...prev };
                                for (const observed of observedServices) {
                                  const draft = prev[observed.id];
                                  if (!draft) continue;
                                  const draftId = (draft.id ?? observed.id ?? "").toString().trim();
                                  const dirty =
                                    (draft.id ?? undefined) !== undefined && draftId !== observed.id ||
                                    draft.replicas !== undefined && draft.replicas !== observed.replicas ||
                                    draft.cpu_cores !== undefined && draft.cpu_cores !== observed.cpu_cores ||
                                    draft.memory_mb !== undefined && draft.memory_mb !== observed.memory_mb;
                                  if (dirty) delete next[observed.id];
                                }
                                return next;
                              });
                            }
                          }}
                          disabled={configUpdateLoading || dirtyInvalidCount > 0}
                          title={dirtyInvalidCount > 0 ? "Fix invalid dirty service rows before bulk apply." : undefined}
                          className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {configUpdateLoading ? "Applying…" : "Apply changed services"}
                        </button>
                      </div>
                    </div>
                    {dirtyInvalidCount > 0 && (
                      <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                        Fix invalid dirty rows before bulk apply: {dirtyInvalidServiceIds.join(", ")}
                      </p>
                    )}
                    {observedAndDraftServiceIds.length === 0 ? (
                      <p className="text-xs text-white/30 italic">No services observed yet. Waiting for runtime state or scenario fallback.</p>
                    ) : (
                      <div className="space-y-2">
                        {observedAndDraftServiceIds.map((serviceId) => {
                            const observed = observedServicesById[serviceId] ?? { id: serviceId };
                            const draft = serviceMixerDrafts[observed.id] ?? {};
                            const draftId = (draft.id ?? observed.id).toString().trim();
                            const effectiveReplicas = draft.replicas ?? observed.replicas;
                            const effectiveCpu = draft.cpu_cores ?? observed.cpu_cores;
                            const effectiveMem = draft.memory_mb ?? observed.memory_mb;
                            const dirty =
                              (draft.id ?? undefined) !== undefined && draftId !== observed.id ||
                              draft.replicas !== undefined && draft.replicas !== observed.replicas ||
                              draft.cpu_cores !== undefined && draft.cpu_cores !== observed.cpu_cores ||
                              draft.memory_mb !== undefined && draft.memory_mb !== observed.memory_mb;
                            const rowDraft: RuntimeServiceDraft = {
                              id: draftId || observed.id,
                              replicas: effectiveReplicas,
                              cpu_cores: draft.cpu_cores !== undefined ? effectiveCpu : undefined,
                              memory_mb: draft.memory_mb !== undefined ? effectiveMem : undefined,
                            };
                            const rowValidation = buildServicePatchPayloadFromModel(
                              onlineConfigModel,
                              [rowDraft],
                              serviceReplicaHints
                            );
                            const rowError = dirty && !rowValidation.ok ? rowValidation.error : undefined;
                            const pending = pendingServiceObservationById[draftId] ?? pendingServiceObservationById[observed.id];
                            const cpuUtilPct =
                              typeof observed.cpu_utilization === "number"
                                ? observed.cpu_utilization <= 1
                                  ? observed.cpu_utilization * 100
                                  : observed.cpu_utilization
                                : undefined;
                            const memUtilPct =
                              typeof observed.memory_utilization === "number"
                                ? observed.memory_utilization <= 1
                                  ? observed.memory_utilization * 100
                                  : observed.memory_utilization
                                : undefined;
                            return (
                              <div key={observed.id} className="rounded border border-border bg-black/20 p-2 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-white">{observed.id}</span>
                                    {dirty && (
                                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                        dirty
                                      </span>
                                    )}
                                    {pending && (
                                      <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
                                        pending observation
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const ok = await applyServices(
                                          [rowDraft],
                                          { [observed.id]: observed.replicas },
                                          typeof rowDraft.id === "string" && rowDraft.id.trim() && typeof rowDraft.replicas === "number"
                                            ? {
                                                [rowDraft.id]: {
                                                  replicas: rowDraft.replicas,
                                                  cpu_cores: rowDraft.cpu_cores,
                                                  memory_mb: rowDraft.memory_mb,
                                                },
                                              }
                                            : undefined
                                        );
                                        if (ok) {
                                          setServiceMixerDrafts((prev) => {
                                            const next = { ...prev };
                                            delete next[observed.id];
                                            return next;
                                          });
                                        }
                                      }}
                                      disabled={configUpdateLoading || Boolean(rowError) || !dirty}
                                      className="px-2 py-1 text-xs rounded border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50"
                                    >
                                      Apply
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setServiceMixerDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[observed.id];
                                          return next;
                                        })
                                      }
                                      className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                                      title="Reset draft"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  <label className="text-[11px] text-white/60">
                                    Service ID
                                    <input
                                      value={draft.id ?? observed.id}
                                      onChange={(e) =>
                                        setServiceMixerDrafts((prev) => ({
                                          ...prev,
                                          [observed.id]: { ...(prev[observed.id] ?? {}), id: e.target.value },
                                        }))
                                      }
                                      className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                    />
                                  </label>
                                  <label className="text-[11px] text-white/60">
                                    Replicas (obs: {observed.replicas ?? "—"})
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={draft.replicas ?? (observed.replicas ?? "")}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                                        setServiceMixerDrafts((prev) => ({
                                          ...prev,
                                          [observed.id]: { ...(prev[observed.id] ?? {}), replicas: Number.isFinite(v) ? v : undefined },
                                        }));
                                      }}
                                      className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                    />
                                  </label>
                                  <label className="text-[11px] text-white/60">
                                    CPU cores (obs: {observed.cpu_cores ?? "—"})
                                    <input
                                      type="number"
                                      min={0.1}
                                      step={0.1}
                                      value={draft.cpu_cores ?? (observed.cpu_cores ?? "")}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                        setServiceMixerDrafts((prev) => ({
                                          ...prev,
                                          [observed.id]: { ...(prev[observed.id] ?? {}), cpu_cores: Number.isFinite(v) ? v : undefined },
                                        }));
                                      }}
                                      className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                    />
                                  </label>
                                  <label className="text-[11px] text-white/60">
                                    Memory MB (obs: {observed.memory_mb ?? "—"})
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={draft.memory_mb ?? (observed.memory_mb ?? "")}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                        setServiceMixerDrafts((prev) => ({
                                          ...prev,
                                          [observed.id]: { ...(prev[observed.id] ?? {}), memory_mb: Number.isFinite(v) ? v : undefined },
                                        }));
                                      }}
                                      className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                    />
                                  </label>
                                </div>
                                <div className="flex flex-wrap gap-3 text-[11px] text-white/50">
                                  <span>CPU util: {cpuUtilPct != null ? `${cpuUtilPct.toFixed(1)}%` : "—"}</span>
                                  <span>Mem util: {memUtilPct != null ? `${memUtilPct.toFixed(1)}%` : "—"}</span>
                                </div>
                                {rowError && <p className="text-[11px] text-red-300">{rowError}</p>}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {controlRoomTab === "traffic" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Traffic</h3>
                      <span className="text-[10px] text-white/30 font-mono">PATCH /workload or /configuration</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const candidate =
                              knownPatternKeys.find((key): key is string => typeof key === "string" && !trafficConsoleDrafts[key]) ??
                              (typeof knownPatternKeys[0] === "string" ? knownPatternKeys[0] : undefined);
                            if (!candidate) return;
                            setTrafficConsoleDrafts((prev) => ({ ...prev, [candidate]: { pattern_key: candidate, rate_rps: 1 } }));
                          }}
                          className="px-2 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add pattern
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const observedLanes = observedAndDraftPatternKeys.map((patternKey) => observedTrafficByPattern[patternKey] ?? { pattern_key: patternKey });
                            const changedRows: PatchRunConfigurationWorkloadItem[] = [];
                            const pendingTargets: Record<string, { rate_rps: number }> = {};
                            const invalidDirtyRows: string[] = [];
                            for (const observed of observedLanes) {
                              const draft = trafficConsoleDrafts[observed.pattern_key] ?? {};
                              const draftPatternKey = (draft.pattern_key ?? observed.pattern_key).toString().trim();
                              const effectiveRate = draft.rate_rps ?? observed.observed_rate_rps;
                              const dirty =
                                (draft.pattern_key ?? undefined) !== undefined && draftPatternKey !== observed.pattern_key ||
                                draft.rate_rps !== undefined && draft.rate_rps !== observed.observed_rate_rps;
                              if (!dirty) continue;
                              const row: PatchRunConfigurationWorkloadItem = {
                                pattern_key: draftPatternKey || observed.pattern_key,
                                rate_rps: effectiveRate ?? 0,
                              };
                              const rowValidation = buildWorkloadPatchPayloadFromModel(onlineConfigModel, [row]);
                              if (!rowValidation.ok) {
                                invalidDirtyRows.push(observed.pattern_key);
                                continue;
                              }
                              changedRows.push(row);
                              if (row.pattern_key && typeof row.rate_rps === "number" && row.rate_rps > 0) {
                                pendingTargets[row.pattern_key] = { rate_rps: row.rate_rps };
                              }
                            }
                            if (invalidDirtyRows.length > 0 || changedRows.length === 0) return;
                            const ok = await applyWorkload(changedRows, pendingTargets);
                            if (ok) {
                              setTrafficConsoleDrafts((prev) => {
                                const next = { ...prev };
                                for (const observed of observedLanes) {
                                  const draft = prev[observed.pattern_key];
                                  if (!draft) continue;
                                  const draftPatternKey = (draft.pattern_key ?? observed.pattern_key).toString().trim();
                                  const dirty =
                                    (draft.pattern_key ?? undefined) !== undefined && draftPatternKey !== observed.pattern_key ||
                                    draft.rate_rps !== undefined && draft.rate_rps !== observed.observed_rate_rps;
                                  if (dirty) delete next[observed.pattern_key];
                                }
                                return next;
                              });
                            }
                          }}
                          disabled={configUpdateLoading || dirtyInvalidTrafficCount > 0}
                          title={dirtyInvalidTrafficCount > 0 ? "Fix invalid dirty traffic rows before bulk apply." : undefined}
                          className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {configUpdateLoading ? "Applying…" : "Apply changed traffic"}
                        </button>
                      </div>
                    </div>
                    {(liveThroughputRps != null || liveRequestCount != null) && (
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/45">
                        {liveThroughputRps != null && <span>Live throughput: {liveThroughputRps.toFixed(2)} rps</span>}
                        {liveRequestCount != null && <span>Live request count: {Math.round(liveRequestCount).toLocaleString()}</span>}
                      </div>
                    )}
                    {dirtyInvalidTrafficCount > 0 && (
                      <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                        Fix invalid dirty traffic rows before bulk apply: {dirtyInvalidTrafficKeys.join(", ")}
                      </p>
                    )}
                    {observedAndDraftPatternKeys.length === 0 ? (
                      <p className="text-xs text-white/30 italic">No workload patterns observed yet. Waiting for optimization config or scenario fallback.</p>
                    ) : (
                      <div className="space-y-2">
                        {observedAndDraftPatternKeys.map((patternKey) => {
                          const observed = observedTrafficByPattern[patternKey] ?? { pattern_key: patternKey };
                          const draft = trafficConsoleDrafts[observed.pattern_key] ?? {};
                          const draftPatternKey = (draft.pattern_key ?? observed.pattern_key).toString().trim();
                          const effectiveRate = draft.rate_rps ?? observed.observed_rate_rps;
                          const dirty =
                            (draft.pattern_key ?? undefined) !== undefined && draftPatternKey !== observed.pattern_key ||
                            draft.rate_rps !== undefined && draft.rate_rps !== observed.observed_rate_rps;
                          const rowDraft: PatchRunConfigurationWorkloadItem = {
                            pattern_key: draftPatternKey || observed.pattern_key,
                            rate_rps: effectiveRate ?? 0,
                          };
                          const rowValidation = buildWorkloadPatchPayloadFromModel(onlineConfigModel, [rowDraft]);
                          const rowError = dirty && !rowValidation.ok ? rowValidation.error : undefined;
                          const pending =
                            pendingTrafficObservationByPattern[draftPatternKey] ??
                            pendingTrafficObservationByPattern[observed.pattern_key];
                          const baseRate = observed.observed_rate_rps ?? effectiveRate ?? 1;
                          const sliderMin = Math.max(0.1, Number((baseRate * 0.25).toFixed(2)));
                          const sliderMax = Math.max(sliderMin + 0.1, Number((baseRate * 5).toFixed(2)));
                          const patternOptions = [...knownPatternKeys];
                          if (observed.pattern_key && !patternOptions.includes(observed.pattern_key)) patternOptions.push(observed.pattern_key);
                          if (draft.pattern_key && !patternOptions.includes(draft.pattern_key)) patternOptions.push(draft.pattern_key);
                          patternOptions.sort();
                          return (
                            <div key={observed.pattern_key} className="rounded border border-border bg-black/20 p-2 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-white">{observed.pattern_key}</span>
                                  {dirty && (
                                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                      dirty
                                    </span>
                                  )}
                                  {pending && (
                                    <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
                                      pending observation
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (rowError) return;
                                      const ok = await applyWorkload(
                                        [rowDraft],
                                        rowDraft.pattern_key && rowDraft.rate_rps > 0
                                          ? { [rowDraft.pattern_key]: { rate_rps: rowDraft.rate_rps } }
                                          : undefined
                                      );
                                      if (ok) {
                                        setTrafficConsoleDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[observed.pattern_key];
                                          return next;
                                        });
                                      }
                                    }}
                                    disabled={configUpdateLoading || Boolean(rowError) || !dirty}
                                    className="px-2 py-1 text-xs rounded border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50"
                                  >
                                    Apply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTrafficConsoleDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[observed.pattern_key];
                                        return next;
                                      })
                                    }
                                    className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                                    title="Reset draft"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <label className="text-[11px] text-white/60">
                                  Pattern key
                                  <select
                                    value={draft.pattern_key ?? observed.pattern_key}
                                    onChange={(e) =>
                                      setTrafficConsoleDrafts((prev) => ({
                                        ...prev,
                                        [observed.pattern_key]: { ...(prev[observed.pattern_key] ?? {}), pattern_key: e.target.value },
                                      }))
                                    }
                                    className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                  >
                                    {patternOptions.length === 0 && <option value="">Select…</option>}
                                    {patternOptions.map((key) => (
                                      <option key={key} value={key}>{key || "(empty)"}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-[11px] text-white/60">
                                  Target RPS (obs: {observed.observed_rate_rps != null ? observed.observed_rate_rps.toFixed(2) : "—"})
                                  <input
                                    type="number"
                                    min={0.01}
                                    step={0.1}
                                    value={draft.rate_rps ?? (observed.observed_rate_rps ?? "")}
                                    onChange={(e) => {
                                      const value = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                      setTrafficConsoleDrafts((prev) => ({
                                        ...prev,
                                        [observed.pattern_key]: {
                                          ...(prev[observed.pattern_key] ?? {}),
                                          rate_rps: Number.isFinite(value) ? value : undefined,
                                        },
                                      }));
                                    }}
                                    className="mt-1 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                                  />
                                </label>
                                <label className="text-[11px] text-white/60">
                                  Target slider
                                  <input
                                    type="range"
                                    min={sliderMin}
                                    max={sliderMax}
                                    step={0.1}
                                    value={Math.min(sliderMax, Math.max(sliderMin, draft.rate_rps ?? (observed.observed_rate_rps ?? sliderMin)))}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value);
                                      setTrafficConsoleDrafts((prev) => ({
                                        ...prev,
                                        [observed.pattern_key]: {
                                          ...(prev[observed.pattern_key] ?? {}),
                                          rate_rps: Number.isFinite(value) ? value : undefined,
                                        },
                                      }));
                                    }}
                                    className="mt-2 w-full accent-cyan-400"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {[0.5, 1, 2, 5].map((multiplier) => (
                                  <button
                                    key={multiplier}
                                    type="button"
                                    onClick={() => {
                                      const value = Number((baseRate * multiplier).toFixed(2));
                                      setTrafficConsoleDrafts((prev) => ({
                                        ...prev,
                                        [observed.pattern_key]: {
                                          ...(prev[observed.pattern_key] ?? {}),
                                          pattern_key: draft.pattern_key ?? observed.pattern_key,
                                          rate_rps: value,
                                        },
                                      }));
                                    }}
                                    className="px-2 py-0.5 rounded border border-white/15 bg-white/5 text-[10px] text-white/70 hover:bg-white/10"
                                  >
                                    {multiplier === 1 ? "1x reset" : `${multiplier}x`}
                                  </button>
                                ))}
                                {!observedTrafficByPattern[observed.pattern_key] && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTrafficConsoleDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[observed.pattern_key];
                                        return next;
                                      })
                                    }
                                    className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Remove draft lane"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {rowError && <p className="text-[11px] text-red-300">{rowError}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {controlRoomTab === "autoscaling" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium text-white/70 uppercase tracking-wide">Autoscaling</h3>
                      <button
                        type="button"
                        onClick={applyPolicies}
                        disabled={configUpdateLoading}
                        className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {configUpdateLoading ? "Applying…" : "Apply autoscaling"}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-white/70">
                        <input
                          type="checkbox"
                          checked={autoscaling.enabled}
                          onChange={(e) =>
                            setLiveConfig((prev) => {
                              const c = prev ?? DEFAULT_LIVE_CONFIG;
                              return {
                                ...c,
                                policies: {
                                  autoscaling: {
                                    ...(c.policies?.autoscaling ?? { enabled: false, target_cpu_util: 70, scale_step: 1 }),
                                    enabled: e.target.checked,
                                  },
                                },
                              };
                            })
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
                          value={targetCpuPercent}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setLiveConfig((prev) => {
                              const c = prev ?? DEFAULT_LIVE_CONFIG;
                              return {
                                ...c,
                                policies: {
                                  autoscaling: {
                                    ...(c.policies?.autoscaling ?? { enabled: false, target_cpu_util: 70, scale_step: 1 }),
                                    target_cpu_util: Number.isFinite(v) ? v : 70,
                                  },
                                },
                              };
                            });
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
                            setLiveConfig((prev) => {
                              const c = prev ?? DEFAULT_LIVE_CONFIG;
                              return {
                                ...c,
                                policies: {
                                  autoscaling: {
                                    ...(c.policies?.autoscaling ?? { enabled: false, target_cpu_util: 70, scale_step: 1 }),
                                    scale_step: Number.isFinite(v) && v >= 1 ? v : 1,
                                  },
                                },
                              };
                            });
                          }}
                          className="w-16 px-2 py-1 rounded bg-black/30 border border-white/10 text-white font-mono text-xs"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {controlRoomTab === "lease" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="rounded border border-border bg-black/20 px-2 py-1.5">
                        <p className="text-white/40">lease_ttl_ms</p>
                        <p className="text-white/80 font-mono">{leaseTtlMs ?? "—"}</p>
                      </div>
                      <div className="rounded border border-border bg-black/20 px-2 py-1.5">
                        <p className="text-white/40">Auto renew</p>
                        <p className="text-white/80 font-mono">{leaseTtlMs != null ? "enabled" : "disabled"}</p>
                      </div>
                      <div className="rounded border border-border bg-black/20 px-2 py-1.5">
                        <p className="text-white/40">Last renewal</p>
                        <p className="text-white/80 font-mono">{leaseRenewStatus}</p>
                      </div>
                      <div className="rounded border border-border bg-black/20 px-2 py-1.5">
                        <p className="text-white/40">Next renewal</p>
                        <p className="text-white/80 font-mono">
                          {nextLeaseRenewAtRef.current ? new Date(nextLeaseRenewAtRef.current).toISOString().substring(11, 19) : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleManualLeaseRenew}
                        disabled={manualLeaseRenewLoading}
                        className="px-3 py-1.5 text-xs rounded-lg border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {manualLeaseRenewLoading ? "Renewing…" : "Renew lease"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStop("completed")}
                        disabled={isStopping}
                        className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {isStopping ? "…" : "Complete run"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStop("cancelled")}
                        disabled={isStopping}
                        className="px-3 py-1.5 text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {isStopping ? "…" : "Cancel run"}
                      </button>
                    </div>
                    {leaseRenewError && (
                      <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                        Lease renewal: {leaseRenewError}
                      </p>
                    )}
                  </div>
                )}

                {controlRoomTab === "locked" && (
                  <div className="space-y-2">
                    <p className="text-xs text-white/45">Create-time settings (read-only; create a new run to change).</p>
                    {lockedFields.length === 0 ? (
                      <p className="text-xs text-white/30 italic">No locked online settings observed for this run.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {lockedFields.map((f) => (
                          <span key={f.key} className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/70">
                            <span className="text-white/45">{f.key}</span>:{" "}
                            <span className="font-mono">
                              {typeof f.observedValue === "object"
                                ? JSON.stringify(f.observedValue)
                                : String(f.observedValue)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {controlRoomTab === "change_log" && (
                  <div className="space-y-2">
                    <p className="text-xs text-white/45">Runtime change history placeholder (optimizer-step derived for now).</p>
                    {recentSteps.length === 0 ? (
                      <p className="text-xs text-white/30 italic">No runtime changes observed yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {recentSteps.map((step, idx) => (
                          <div
                            key={`${step.iteration_index ?? "na"}-${idx}-${step.reason ?? ""}`}
                            className="rounded border border-border bg-black/20 px-2 py-1 text-[11px] text-white/70"
                          >
                            <span className="font-mono text-white/50">#{step.iteration_index ?? "—"}</span>{" "}
                            <span>{step.reason ?? "optimizer_step"}</span>
                            {typeof step.score_p95_ms === "number" && (
                              <span className="text-white/45"> · score p95: {step.score_p95_ms.toFixed(1)} ms</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
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

      {/* Host-level metrics from stream — CPU / memory utilization */}
      {(() => {
        const hostIds = Array.from(
          new Set([...Object.keys(hostMetrics), ...Object.keys(hostResources)]),
        );
        if (hostIds.length === 0) return null;
        const toPct = (v: number) => (v <= 1 ? v * 100 : v);
        return (
          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">
              Host metrics
              <span className="ml-2 text-xs font-normal text-white/40">from stream · utilization</span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {hostIds.sort().map((hostId) => {
                const m = hostMetrics[hostId];
                const res = hostResources[hostId];
                const cpuPct = typeof m?.cpu_utilization === "number" ? toPct(m.cpu_utilization) : null;
                const memPct = typeof m?.memory_utilization === "number" ? toPct(m.memory_utilization) : null;
                return (
                  <div
                    key={hostId}
                    className="rounded-lg border border-border bg-black/20 px-3 py-2 flex items-center gap-4"
                  >
                    <span className="text-xs text-white/60 font-mono shrink-0" title={hostId}>{hostId}</span>
                    {res && (typeof res.cpu_cores === "number" || typeof res.memory_gb === "number") && (
                      <span className="text-[11px] text-white/40">
                        {res.cpu_cores != null && `${res.cpu_cores} cores`}
                        {res.cpu_cores != null && res.memory_gb != null && " · "}
                        {res.memory_gb != null && `${res.memory_gb} GB`}
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      {cpuPct != null && (
                        <div className="flex flex-col items-center">
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                            <circle
                              cx="18" cy="18" r="14"
                              fill="none" stroke="#38bdf8" strokeWidth="4"
                              strokeDasharray={`${Math.min(cpuPct / 100 * 0.879, 0.879)} 88`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="text-[10px] text-white/50">CPU</span>
                          <span className="text-xs font-mono text-white">{cpuPct.toFixed(1)}%</span>
                        </div>
                      )}
                      {memPct != null && (
                        <div className="flex flex-col items-center">
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                            <circle
                              cx="18" cy="18" r="14"
                              fill="none" stroke="#34d399" strokeWidth="4"
                              strokeDasharray={`${Math.min(memPct / 100 * 0.879, 0.879)} 88`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="text-[10px] text-white/50">Mem</span>
                          <span className="text-xs font-mono text-white">{memPct.toFixed(1)}%</span>
                        </div>
                      )}
                      {cpuPct == null && memPct == null && (
                        <span className="text-xs text-white/40">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <ClusterPlacementView
        resources={placementSource.resources}
        hostMetrics={hostMetrics}
        mode={placementSource.mode}
        sourceLabel={placementSource.sourceLabel}
        placementsStatus={placementSource.status}
      />

      {/* Request count chart */}
      <RequestCountChart series={chartSeries} onClear={clearChart} />

      {optProgressHint && status === "running" && (
        <div className="text-xs text-amber-100/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
          <span className="text-white/45">Latest optimization progress</span>
          {optProgressHint.objective != null && optProgressHint.objective !== "" && (
            <span className="ml-2 font-mono">
              objective={optProgressHint.objective}
              {optProgressHint.unit ? ` unit=${optProgressHint.unit}` : ""}
            </span>
          )}
          {optProgressHint.best_score != null && (
            <span className="ml-2 font-mono">best_score={optProgressHint.best_score}</span>
          )}
        </div>
      )}

      {/* Optimizer decision replay */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Optimizer decision replay
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

        {optSteps.length === 0 ? (
          <p className="text-xs text-white/35 italic">No optimization decisions recorded for this run.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {[...optSteps]
              .slice()
              .sort((a, b) => {
                const ai = hasNumber(a.iteration_index) ? a.iteration_index : Number.MAX_SAFE_INTEGER;
                const bi = hasNumber(b.iteration_index) ? b.iteration_index : Number.MAX_SAFE_INTEGER;
                if (ai !== bi) return ai - bi;
                const ar = String(a.reason ?? "");
                const br = String(b.reason ?? "");
                return ar.localeCompare(br);
              })
              .map((step, idx) => {
                const overTarget = hasNumber(step.score_p95_ms) && hasNumber(step.target_p95_ms)
                  ? step.score_p95_ms > step.target_p95_ms
                  : undefined;
                const blocked = isOptimizerStepBlocked(step);
                const reasonDetails = asUnknownRecord(step.reason_details);
                const actionLabel = getOptimizationActionLabel(reasonDetails ?? undefined);
                const decisionReason = toStr(reasonDetails?.decision_reason);
                const diffLines = summarizeConfigDiff(step.previous_config, step.current_config);
                const primitiveReasonDetails = Object.entries(reasonDetails ?? {})
                  .filter(([k, v]) =>
                    !["type", "action", "decision_reason", "locality_hit_rate", "min_locality_hit_rate"].includes(k) &&
                    (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
                  )
                  .slice(0, 4);
                return (
                  <div
                    key={`${step.iteration_index ?? "na"}-${actionLabel ?? step.reason ?? "step"}-${idx}`}
                    className="rounded-lg border border-border bg-black/20 p-3 text-xs space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-white/40 shrink-0">#{hasNumber(step.iteration_index) ? step.iteration_index : "—"}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono font-medium ${
                          overTarget === undefined
                            ? "bg-white/10 text-white/50"
                            : overTarget
                              ? "bg-red-500/15 text-red-300"
                              : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        p95 {hasNumber(step.score_p95_ms) ? `${step.score_p95_ms.toFixed(1)} ms` : "—"}
                      </span>
                      <span className="text-white/30">
                        target {hasNumber(step.target_p95_ms) ? `${step.target_p95_ms.toFixed(1)} ms` : "—"}
                      </span>
                      <span className={`font-mono ${overTarget === undefined ? "text-white/45" : overTarget ? "text-red-300" : "text-emerald-300"}`}>
                        {formatTargetDelta(step.score_p95_ms, step.target_p95_ms)}
                      </span>
                      {actionLabel && (
                        <span className="inline-flex rounded border border-blue-500/30 bg-blue-500/10 text-blue-200 px-2 py-0.5 font-medium">
                          {actionLabel}
                        </span>
                      )}
                      {blocked && (
                        <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 px-2 py-0.5 font-medium">
                          guardrail/no-op
                        </span>
                      )}
                    </div>

                    <div className="text-white/70 italic">{step.reason ?? "No reason provided"}</div>

                    {(decisionReason || hasNumber(reasonDetails?.locality_hit_rate) || hasNumber(reasonDetails?.min_locality_hit_rate)) && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {decisionReason && (
                          <span className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-white/65">
                            decision: {decisionReason}
                          </span>
                        )}
                        {hasNumber(reasonDetails?.locality_hit_rate) && (
                          <span className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-white/65">
                            locality hit {formatPercent(reasonDetails?.locality_hit_rate as number, 2)}
                          </span>
                        )}
                        {hasNumber(reasonDetails?.min_locality_hit_rate) && (
                          <span className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-white/65">
                            min locality {formatPercent(reasonDetails?.min_locality_hit_rate as number, 2)}
                          </span>
                        )}
                        {primitiveReasonDetails.map(([k, v]) => (
                          <span key={k} className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-white/65">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-1 border-t border-white/5">
                      {diffLines.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {diffLines.map((line) => (
                            <span key={line} className="font-mono text-[11px] text-white/65 rounded border border-white/10 bg-black/25 px-2 py-0.5">
                              {line}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-white/40 italic">no material config change</p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

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
            Click Fetch candidates to load candidates for this run.
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
            <p className="text-[10px] text-white/35 px-1 pb-2 max-w-3xl leading-relaxed">
              <span className="text-white/45">Feasible</span> and <span className="text-white/45">Eff. score</span> use
              each candidate row when present; otherwise the parent run’s batch summary (
              <code className="text-white/45">batch_recommendation_feasible</code>,{" "}
              <code className="text-white/45">batch_efficiency_score</code>, or{" "}
              <code className="text-white/45">batch_score_breakdown</code>) — shown with a †.{" "}
              <span className="text-white/45">Error %</span> uses <code className="text-white/45">error_rate</code> or{" "}
              <code className="text-white/45">failed_requests / total_requests</code> (N/A if total_requests is 0).{" "}
              <span className="text-white/45">Svc *</span> columns need per-candidate topology; often only the winning row
              is filled. Hover <span className="text-amber-200/70">Best</span> for why the winner was chosen.
            </p>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-white/5 text-white/40 text-left">
                  <th className="px-2 py-2 font-medium whitespace-nowrap">ID</th>
                  <th
                    className="px-2 py-2 font-medium whitespace-nowrap"
                    title="Per-row when API provides it; otherwise this run’s batch summary (see †)."
                  >
                    Feasible
                  </th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">P95 ms</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">RPS</th>
                  <th
                    className="px-2 py-2 font-medium whitespace-nowrap"
                    title="error_rate, or failed_requests ÷ total_requests (N/A if total_requests = 0)"
                  >
                    Error %
                  </th>
                  <th
                    className="px-2 py-2 font-medium whitespace-nowrap"
                    title={`${SVC_TOPOLOGY_ROW_TOOLTIP} Slash-separated if multiple services.`}
                  >
                    Svc rep
                  </th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap" title={SVC_TOPOLOGY_ROW_TOOLTIP}>
                    Svc CPU
                  </th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap" title={SVC_TOPOLOGY_ROW_TOOLTIP}>
                    Svc MB
                  </th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Host cores</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Host GB</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">CPU util</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Mem util</th>
                  <th
                    className="px-2 py-2 font-medium whitespace-nowrap"
                    title="Per-row when API provides it; otherwise this run’s batch summary (see †)."
                  >
                    Eff. score
                  </th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Source</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">YAML</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const isExpanded = expandedCandidate === c.id;
                  const meta = runInfo?.metadata;
                  const isBest = bestCandidate?.best_candidate_id && c.id === bestCandidate.best_candidate_id;
                  const winnerByMeta =
                    typeof meta?.best_run_id === "string" && meta.best_run_id === c.id;
                  const winnerRow = isBest || winnerByMeta;
                  const bestTopo =
                    winnerRow && bestCandidate?.best_candidate ? bestCandidate.best_candidate : null;
                  const services = getCandidateServicesList(c, bestTopo);
                  const hostCells = candidateHostResourceCells(c, bestTopo);
                  const svcRep = joinServiceField(services, "replicas");
                  const svcCpu = joinServiceField(services, "cpu_cores");
                  const svcMb = joinServiceField(services, "memory_mb");
                  const metricsDisplay = candidateMetricsForDisplay(c, meta);
                  const feasCell = candidateBatchFeasibleCell(c, meta);
                  const effCell = candidateBatchEfficiencyCell(c, meta);
                  const p95Disp =
                    candidateMetricNumber(metricsDisplay, [
                      "latency_p95_ms",
                      "p95_latency_ms",
                      "p95_ms",
                      "p95LatencyMs",
                    ]) ?? undefined;
                  const rpsDisp =
                    candidateMetricNumber(metricsDisplay, ["throughput_rps", "rps", "throughput", "requests_per_s"]) ??
                    undefined;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className={`border-b border-border/50 hover:bg-white/5 transition-colors ${isBest ? "bg-amber-500/5" : ""}`}
                      >
                        <td className="px-2 py-2 text-white/80 whitespace-nowrap max-w-[200px] truncate" title={c.id}>
                          {c.id}
                          {isBest && (
                            <span
                              className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 cursor-help border border-amber-500/25"
                              title={BEST_CANDIDATE_WHY_TOOLTIP}
                            >
                              Best
                            </span>
                          )}
                        </td>
                        <td
                          className="px-2 py-2 text-white/70 whitespace-nowrap"
                          title={feasCell.fromRunSummary ? RUN_BATCH_SUMMARY_TOOLTIP : undefined}
                        >
                          {feasCell.text}
                          {feasCell.fromRunSummary ? (
                            <span className="text-white/35 ml-0.5" aria-hidden>
                              †
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-white/70 whitespace-nowrap">
                          {p95Disp != null ? p95Disp.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-2 py-2 text-white/70 whitespace-nowrap">
                          {rpsDisp != null ? rpsDisp.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-2 py-2 text-white/70 whitespace-nowrap">{formatErrorRateCell(metricsDisplay)}</td>
                        <td
                          className="px-2 py-2 text-white/70 whitespace-nowrap"
                          title={
                            svcRep === "—"
                              ? SVC_TOPOLOGY_ROW_TOOLTIP
                              : services.map((s) => s.service_id).filter(Boolean).join(", ")
                          }
                        >
                          {svcRep}
                        </td>
                        <td
                          className="px-2 py-2 text-white/70 whitespace-nowrap"
                          title={svcCpu === "—" ? SVC_TOPOLOGY_ROW_TOOLTIP : undefined}
                        >
                          {svcCpu}
                        </td>
                        <td
                          className="px-2 py-2 text-white/70 whitespace-nowrap"
                          title={svcMb === "—" ? SVC_TOPOLOGY_ROW_TOOLTIP : undefined}
                        >
                          {svcMb}
                        </td>
                        <td className="px-2 py-2 text-white/70 whitespace-nowrap">{hostCells.cores}</td>
                        <td className="px-2 py-2 text-white/70 whitespace-nowrap">{hostCells.memGb}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {metricsDisplay?.cpu_util_pct != null ? (
                            <span className={metricsDisplay.cpu_util_pct > 80 ? "text-red-400" : "text-white/70"}>
                              {metricsDisplay.cpu_util_pct}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {metricsDisplay?.mem_util_pct != null ? (
                            <span className={metricsDisplay.mem_util_pct > 80 ? "text-red-400" : "text-white/70"}>
                              {metricsDisplay.mem_util_pct}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="px-2 py-2 text-white/70 whitespace-nowrap"
                          title={effCell.fromRunSummary ? RUN_BATCH_SUMMARY_TOOLTIP : undefined}
                        >
                          {effCell.text}
                          {effCell.fromRunSummary ? (
                            <span className="text-white/35 ml-0.5" aria-hidden>
                              †
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-white/40 truncate max-w-[120px]" title={c.source}>
                          {c.source ?? "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
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
                        <td className="px-2 py-2 whitespace-nowrap">
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
                          <td colSpan={CANDIDATES_TABLE_COL_COUNT} className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Spec</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(c.spec ?? {}, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Topology (derived)</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(
                                    {
                                      hosts: getCandidateHostsList(c, bestTopo),
                                      services: getCandidateServicesList(c, bestTopo),
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Metrics</p>
                                <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all leading-relaxed">
                                  {JSON.stringify(metricsDisplay ?? {}, null, 2)}
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

              {/* Work amplification KPI */}
              {displayMetrics.summary && (() => {
                const s = displayMetrics.summary;
                const ingress = s.ingress_requests;
                const total = s.total_requests;
                const amplification =
                  typeof ingress === "number" && ingress > 0 && typeof total === "number"
                    ? total / ingress
                    : null;
                return (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Work amplification</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Amplification</p>
                        <p className={`text-lg font-mono font-semibold ${amplification != null ? "text-amber-300" : "text-white/50"}`}>
                          {amplification != null ? `${amplification.toFixed(2)}x` : "—"}
                        </p>
                        {amplification == null && (
                          <p className="text-[10px] text-white/35 mt-1">Requires ingress requests</p>
                        )}
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Ingress requests</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {typeof ingress === "number" ? ingress.toLocaleString() : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Internal requests</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {typeof s.internal_requests === "number" ? s.internal_requests.toLocaleString() : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Retry attempts</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {typeof s.retry_attempts === "number" ? s.retry_attempts.toLocaleString() : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Ingress error rate</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatPercent(s.ingress_error_rate, 2)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Attempt error rate</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatPercent(s.attempt_error_rate, 2)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Service bottleneck matrix</h3>
                  <div className="rounded-lg border border-border bg-black/20 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-white/50">
                          <th className="px-3 py-2 font-medium">Service</th>
                          <th className="px-3 py-2 font-medium text-right">Requests</th>
                          <th className="px-3 py-2 font-medium text-right">Errors</th>
                          <th className="px-3 py-2 font-medium text-right">Latency P95 (ms)</th>
                          <th className="px-3 py-2 font-medium text-right">Queue wait P95 (ms)</th>
                          <th className="px-3 py-2 font-medium text-right">Processing P95 (ms)</th>
                          <th className="px-3 py-2 font-medium text-right">Queue length</th>
                          <th className="px-3 py-2 font-medium text-right">CPU %</th>
                          <th className="px-3 py-2 font-medium text-right">Memory %</th>
                          <th className="px-3 py-2 font-medium text-right">Concurrent</th>
                          <th className="px-3 py-2 font-medium text-right">Replicas</th>
                          <th className="px-3 py-2 font-medium text-right">Bottleneck</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayMetrics.metrics.service_metrics.map((sm) => {
                          const bottleneck = classifyServiceBottleneck(sm);
                          const cpuVal = formatPercent(sm.cpu_utilization).replace("%", "");
                          const memVal = formatPercent(sm.memory_utilization).replace("%", "");
                          return (
                            <tr key={sm.service_name} className="border-b border-border/50 last:border-0">
                              <td className="px-3 py-2 text-white font-mono truncate max-w-[160px]" title={sm.service_name}>{sm.service_name}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.request_count != null ? sm.request_count.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.error_count != null ? sm.error_count.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.latency_p95_ms != null ? sm.latency_p95_ms.toFixed(0) : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.queue_wait_p95_ms != null ? sm.queue_wait_p95_ms.toFixed(0) : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.processing_latency_p95_ms != null ? sm.processing_latency_p95_ms.toFixed(0) : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.queue_length != null ? sm.queue_length.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{cpuVal}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{memVal}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.concurrent_requests != null ? sm.concurrent_requests : "—"}</td>
                              <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{sm.active_replicas != null ? sm.active_replicas : "—"}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${bottleneckTagClasses(bottleneck)}`}>
                                  {bottleneck}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Endpoint triage */}
              {(() => {
                const rows = displayMetrics.metrics?.endpoint_request_stats;
                if (!Array.isArray(rows) || rows.length === 0) {
                  return (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Endpoint triage</h3>
                      <p className="text-xs text-white/35 italic">No endpoint request stats reported for this run.</p>
                    </div>
                  );
                }

                const sortedRows = [...rows].sort((a, b) => {
                  const aErr = endpointErrorRate(a.request_count, a.error_count) ?? -1;
                  const bErr = endpointErrorRate(b.request_count, b.error_count) ?? -1;
                  if (bErr !== aErr) return bErr - aErr;
                  const aRoot = hasNumber(a.root_latency_p95_ms) ? a.root_latency_p95_ms : -1;
                  const bRoot = hasNumber(b.root_latency_p95_ms) ? b.root_latency_p95_ms : -1;
                  if (bRoot !== aRoot) return bRoot - aRoot;
                  const aReq = hasNumber(a.request_count) ? a.request_count : -1;
                  const bReq = hasNumber(b.request_count) ? b.request_count : -1;
                  if (bReq !== aReq) return bReq - aReq;
                  const svcCmp = String(a.service_name ?? "").localeCompare(String(b.service_name ?? ""));
                  if (svcCmp !== 0) return svcCmp;
                  return String(a.endpoint_path ?? "").localeCompare(String(b.endpoint_path ?? ""));
                });

                return (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Endpoint triage</h3>
                    <div className="rounded-lg border border-border bg-black/20 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-white/50">
                            <th className="px-3 py-2 font-medium">Service</th>
                            <th className="px-3 py-2 font-medium">Endpoint</th>
                            <th className="px-3 py-2 font-medium text-right">Requests</th>
                            <th className="px-3 py-2 font-medium text-right">Errors</th>
                            <th className="px-3 py-2 font-medium text-right">Error rate</th>
                            <th className="px-3 py-2 font-medium text-right">Root p95</th>
                            <th className="px-3 py-2 font-medium text-right">Hop p95</th>
                            <th className="px-3 py-2 font-medium text-right">Queue wait p95</th>
                            <th className="px-3 py-2 font-medium text-right">Processing p95</th>
                            <th className="px-3 py-2 font-medium text-right">Triage tag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRows.map((row, idx) => {
                            const triage = classifyEndpointTriage(row);
                            const errRate = endpointErrorRate(row.request_count, row.error_count);
                            return (
                              <tr key={`${row.service_name}:${row.endpoint_path}:${idx}`} className="border-b border-border/50 last:border-0">
                                <td className="px-3 py-2 text-white font-mono truncate max-w-[140px]" title={row.service_name}>
                                  {row.service_name}
                                </td>
                                <td className="px-3 py-2 text-white/85 font-mono truncate max-w-[220px]" title={row.endpoint_path}>
                                  {row.endpoint_path}
                                </td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatCount(row.request_count)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatCount(row.error_count)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatPercent(errRate, 2)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatMs(row.root_latency_p95_ms)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatMs(row.latency_p95_ms)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatMs(row.queue_wait_p95_ms)}</td>
                                <td className="px-3 py-2 text-white/80 text-right font-mono tabular-nums">{formatMs(row.processing_latency_p95_ms)}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${endpointTriageTagClasses(triage)}`}>
                                    {triage}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Messaging pressure */}
              {displayMetrics.summary && (() => {
                const s = displayMetrics.summary;
                const queuePressure = (s.max_queue_depth ?? 0) + (s.queue_oldest_message_age_ms ?? 0) + (s.queue_dlq_count_total ?? 0);
                const topicPressure = (s.topic_consumer_lag_sum ?? 0) + (s.topic_oldest_message_age_ms ?? 0);
                const messagingAggregateValues = [
                  s.queue_depth_sum,
                  s.max_queue_depth,
                  s.queue_oldest_message_age_ms,
                  s.queue_drop_rate,
                  s.queue_redelivery_count_total,
                  s.queue_dlq_count_total,
                  s.topic_backlog_depth_sum,
                  s.topic_consumer_lag_sum,
                  s.topic_oldest_message_age_ms,
                  s.topic_drop_rate,
                ];
                const hasData =
                  queueResources.length > 0 ||
                  topicResources.length > 0 ||
                  messagingAggregateValues.some((v) => hasNumber(v));
                if (!hasData) {
                  return (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Messaging pressure</h3>
                      <p className="text-xs text-white/35 italic">
                        No queue/topic pressure data reported for this run.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Messaging pressure</h3>
                      <span className="text-[10px] text-white/45">source: {placementSource.sourceLabel}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                      <div className={`rounded-lg border p-3 ${queuePressure > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-black/20"}`}>
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Queue depth (sum / max)</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatPair(s.queue_depth_sum, s.max_queue_depth)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Queue oldest age</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatMs(s.queue_oldest_message_age_ms)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Queue drop / redelivery / DLQ</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {`${formatPercent(s.queue_drop_rate, 2)} · ${formatCount(s.queue_redelivery_count_total)} · ${formatCount(s.queue_dlq_count_total)}`}
                        </p>
                      </div>
                      <div className={`rounded-lg border p-3 ${topicPressure > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-black/20"}`}>
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Topic backlog / lag</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {formatPair(s.topic_backlog_depth_sum, s.topic_consumer_lag_sum)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Topic oldest age / drop rate</p>
                        <p className="text-sm font-mono font-semibold text-white">
                          {`${formatMs(s.topic_oldest_message_age_ms)} · ${formatPercent(s.topic_drop_rate, 2)}`}
                        </p>
                      </div>
                    </div>

                    {queueResources.length > 0 && (
                      <div className="rounded-lg border border-border bg-black/20 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border text-white/50">
                              <th className="px-3 py-2 font-medium">Queue</th>
                              <th className="px-3 py-2 font-medium">Broker</th>
                              <th className="px-3 py-2 font-medium text-right">Depth</th>
                              <th className="px-3 py-2 font-medium text-right">In-flight</th>
                              <th className="px-3 py-2 font-medium text-right">Max conc.</th>
                              <th className="px-3 py-2 font-medium text-right">Consumer target</th>
                              <th className="px-3 py-2 font-medium text-right">Oldest age</th>
                              <th className="px-3 py-2 font-medium text-right">Drop</th>
                              <th className="px-3 py-2 font-medium text-right">Redelivery</th>
                              <th className="px-3 py-2 font-medium text-right">DLQ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {queueResources.map((q, idx) => {
                              const broker = q.broker || q.broker_service || "—";
                              return (
                              <tr key={`${broker}-${q.topic}-${idx}`} className="border-b border-border/50 last:border-0">
                                <td className="px-3 py-2 text-white/85 font-mono truncate max-w-[180px]" title={q.topic}>{q.topic}</td>
                                <td className="px-3 py-2 text-white/70 font-mono">{broker}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.depth != null ? q.depth.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.in_flight != null ? q.in_flight.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.max_concurrency != null ? q.max_concurrency : "—"}</td>
                                <td className="px-3 py-2 font-mono text-white/80">{q.consumer_target != null ? q.consumer_target : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{formatMs(q.oldest_message_age_ms)}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.drop_count != null ? q.drop_count.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.redelivery_count != null ? q.redelivery_count.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{q.dlq_count != null ? q.dlq_count.toLocaleString() : "—"}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {topicResources.length > 0 && (
                      <div className="rounded-lg border border-border bg-black/20 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border text-white/50">
                              <th className="px-3 py-2 font-medium">Topic</th>
                              <th className="px-3 py-2 font-medium">Broker</th>
                              <th className="px-3 py-2 font-medium">Partition</th>
                              <th className="px-3 py-2 font-medium">Subscriber</th>
                              <th className="px-3 py-2 font-medium">Consumer group</th>
                              <th className="px-3 py-2 font-medium text-right">Depth</th>
                              <th className="px-3 py-2 font-medium text-right">In-flight</th>
                              <th className="px-3 py-2 font-medium text-right">Max conc.</th>
                              <th className="px-3 py-2 font-medium text-right">Consumer target</th>
                              <th className="px-3 py-2 font-medium text-right">Oldest age</th>
                              <th className="px-3 py-2 font-medium text-right">Drop</th>
                              <th className="px-3 py-2 font-medium text-right">Redelivery</th>
                              <th className="px-3 py-2 font-medium text-right">DLQ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topicResources.map((t, idx) => {
                              const broker = t.broker || t.broker_service || "—";
                              return (
                              <tr key={`${broker}-${t.topic}-${t.partition ?? "na"}-${idx}`} className="border-b border-border/50 last:border-0">
                                <td className="px-3 py-2 text-white/85 font-mono truncate max-w-[180px]" title={t.topic}>{t.topic}</td>
                                <td className="px-3 py-2 text-white/70 font-mono">{broker}</td>
                                <td className="px-3 py-2 text-white/70 font-mono">{t.partition ?? "—"}</td>
                                <td className="px-3 py-2 text-white/70 font-mono">{t.subscriber ?? "—"}</td>
                                <td className="px-3 py-2 text-white/70 font-mono">{t.consumer_group ?? "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.depth != null ? t.depth.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.in_flight != null ? t.in_flight.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.max_concurrency != null ? t.max_concurrency : "—"}</td>
                                <td className="px-3 py-2 font-mono text-white/80">{t.consumer_target != null ? t.consumer_target : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{formatMs(t.oldest_message_age_ms)}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.drop_count != null ? t.drop_count.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.redelivery_count != null ? t.redelivery_count.toLocaleString() : "—"}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-white/80">{t.dlq_count != null ? t.dlq_count.toLocaleString() : "—"}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Topology / locality */}
              {displayMetrics.summary && (() => {
                const s = displayMetrics.summary;
                const sameZoneCount = hasNumber(s.same_zone_request_count_total) ? s.same_zone_request_count_total : undefined;
                const crossZoneCount = hasNumber(s.cross_zone_request_count_total) ? s.cross_zone_request_count_total : undefined;
                const totalCount =
                  hasNumber(sameZoneCount) && hasNumber(crossZoneCount)
                    ? sameZoneCount + crossZoneCount
                    : undefined;
                const directFraction = normalizeFraction(s.cross_zone_request_fraction);
                const derivedFraction =
                  directFraction ??
                  (hasNumber(totalCount) && totalCount > 0 && hasNumber(crossZoneCount)
                    ? crossZoneCount / totalCount
                    : undefined);
                const localityHitRate = normalizeFraction(s.locality_hit_rate);
                const sameZoneShare =
                  hasNumber(totalCount) && totalCount > 0 && hasNumber(sameZoneCount)
                    ? sameZoneCount / totalCount
                    : hasNumber(derivedFraction)
                      ? 1 - derivedFraction
                      : undefined;
                const crossZoneShare =
                  hasNumber(totalCount) && totalCount > 0 && hasNumber(crossZoneCount)
                    ? crossZoneCount / totalCount
                    : derivedFraction;
                const topologyHealth = classifyTopologyHealth(
                  localityHitRate,
                  derivedFraction,
                  s.topology_latency_penalty_ms_mean,
                );
                const hasTopologyData = [
                  localityHitRate,
                  sameZoneCount,
                  crossZoneCount,
                  derivedFraction,
                  s.cross_zone_latency_penalty_ms_mean,
                  s.same_zone_latency_penalty_ms_mean,
                  s.external_latency_ms_mean,
                  s.topology_latency_penalty_ms_mean,
                  s.cross_zone_latency_penalty_ms_total,
                  s.same_zone_latency_penalty_ms_total,
                  s.external_latency_ms_total,
                  s.topology_latency_penalty_ms_total,
                ].some((v) => hasNumber(v));
                if (!hasTopologyData) {
                  return (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Topology / locality</h3>
                      <p className="text-xs text-white/35 italic">
                        No topology/locality metrics reported for this run.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Topology / locality</h3>
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${topologyHealthClasses(topologyHealth)}`}>
                        {topologyHealth}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Locality hit rate</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatPercent(localityHitRate, 2)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Cross-zone fraction</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatPercent(derivedFraction, 2)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Same-zone requests</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatCount(sameZoneCount)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Cross-zone requests</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatCount(crossZoneCount)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Cross-zone penalty (mean)</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatMs(s.cross_zone_latency_penalty_ms_mean)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Topology penalty (mean)</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatMs(s.topology_latency_penalty_ms_mean)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">External penalty (mean)</p>
                        <p className="text-sm font-mono font-semibold text-white">{formatMs(s.external_latency_ms_mean)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] text-white/55">Zone flow summary</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-36 shrink-0 text-[11px] text-white/60">Same-zone requests</span>
                          <div className="h-2 flex-1 rounded bg-white/10 overflow-hidden">
                            <div
                              className="h-2 bg-emerald-400/80"
                              style={{ width: `${Math.max(0, Math.min(100, (sameZoneShare ?? 0) * 100))}%` }}
                            />
                          </div>
                          <span className="w-20 text-right text-[11px] font-mono text-white/70">
                            {formatPercent(sameZoneShare, 1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-36 shrink-0 text-[11px] text-white/60">Cross-zone requests</span>
                          <div className="h-2 flex-1 rounded bg-white/10 overflow-hidden">
                            <div
                              className="h-2 bg-amber-400/80"
                              style={{ width: `${Math.max(0, Math.min(100, (crossZoneShare ?? 0) * 100))}%` }}
                            />
                          </div>
                          <span className="w-20 text-right text-[11px] font-mono text-white/70">
                            {formatPercent(crossZoneShare, 1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/65">
                          topology total: {formatMs(s.topology_latency_penalty_ms_total)}
                        </span>
                        <span className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/65">
                          external total: {formatMs(s.external_latency_ms_total)}
                        </span>
                        <span className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/65">
                          cross-zone total: {formatMs(s.cross_zone_latency_penalty_ms_total)}
                        </span>
                        <span className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/65">
                          same-zone total: {formatMs(s.same_zone_latency_penalty_ms_total)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                    {TIMESERIES_METRIC_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={timeseriesGroupBy}
                    onChange={(e) => setTimeseriesGroupBy(e.target.value)}
                    className="rounded border border-border bg-black/30 text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30"
                  >
                    {TIMESERIES_GROUP_BY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Group by {opt.label}
                      </option>
                    ))}
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
                <p className="text-[11px] text-white/45">
                  <span className="text-white/60 font-medium">{selectedTimeseriesMetricMeta.label}</span>
                  {` · ${selectedTimeseriesMetricMeta.unit} · ${selectedTimeseriesMetricMeta.behavior.replace("_", " ")}`}
                  {selectedTimeseriesMetricMeta.behavior === "cumulative_counter" ? " (cumulative)" : ""}
                  {selectedTimeseriesMetricMeta.description ? ` — ${selectedTimeseriesMetricMeta.description}` : ""}
                </p>
                {timeseriesApiError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">{timeseriesApiError}</p>
                )}
                {timeseriesApiRows.length > 0 && (() => {
                  const seriesKeys = Array.from(
                    new Set(timeseriesApiRows.flatMap((r) => Object.keys(r).filter((k) => k !== "_t"))),
                  ).filter((s) => !isUnscopedSeriesKey(s));
                  const tMin = timeseriesApiRows[0]?._t as number | undefined;
                  const tMax = timeseriesApiRows[timeseriesApiRows.length - 1]?._t as number | undefined;
                  const allVals = timeseriesApiRows.flatMap((r) => seriesKeys.map((s) => r[s]).filter((v): v is number => typeof v === "number"));
                  const vMax = Math.max(...allVals, 0) * 1.2 || 1;
                  if (seriesKeys.length === 0) {
                    return (
                      <p className="text-[11px] text-white/35 italic">
                        No series found for grouping <span className="font-mono">{timeseriesGroupBy}</span>. Try Auto or another label.
                      </p>
                    );
                  }
                  const yFmt = (value: number) => {
                    if (!Number.isFinite(value)) return "—";
                    if (selectedTimeseriesMetricMeta.unit === "ms") return `${value.toFixed(0)} ms`;
                    if (selectedTimeseriesMetricMeta.unit === "percent") {
                      const pct = value <= 1 ? value * 100 : value;
                      return `${pct.toFixed(1)}%`;
                    }
                    if (selectedTimeseriesMetricMeta.unit === "count") return value.toLocaleString();
                    if (selectedTimeseriesMetricMeta.unit === "rps") return `${value.toFixed(2)} rps`;
                    return value.toFixed(2);
                  };
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
                          <YAxis
                            domain={[0, vMax]}
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            width={60}
                            tickCount={5}
                            tickFormatter={yFmt}
                          />
                          <Tooltip
                            contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)" }}
                            labelFormatter={(label) => typeof label === "number" ? new Date(label).toISOString() : String(label ?? "")}
                            formatter={(v, name) => [typeof v === "number" ? yFmt(v) : String(v ?? ""), String(name ?? "")]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {seriesKeys.map((svc, i) => (
                            <Line
                              key={svc}
                              dataKey={svc}
                              name={flatTimeseriesLegendLabel(svc, timeseriesApiMetric)}
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
                {unscopedMetricDebug.length > 0 && (
                  <details className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <summary className="cursor-pointer text-[11px] text-white/55">
                      Unscoped metrics debug ({unscopedMetricDebug.length})
                    </summary>
                    <div className="mt-2 max-h-48 overflow-auto rounded border border-white/10">
                      <table className="w-full text-[10px] font-mono">
                        <thead className="sticky top-0 bg-black/80 text-white/45">
                          <tr>
                            <th className="text-left px-2 py-1">source</th>
                            <th className="text-left px-2 py-1">metric</th>
                            <th className="text-left px-2 py-1">time</th>
                            <th className="text-left px-2 py-1">value</th>
                            <th className="text-left px-2 py-1">ids/labels</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unscopedMetricDebug.slice().reverse().map((p, i) => (
                            <tr key={`${p.source}-${p.metric}-${p.timestamp}-${p.value}-${i}`} className="border-t border-white/5">
                              <td className="px-2 py-1 text-white/65">{p.source}</td>
                              <td className="px-2 py-1 text-white/65">{p.metric}</td>
                              <td className="px-2 py-1 text-white/50">{p.timestamp}</td>
                              <td className="px-2 py-1 text-white/75">{p.value}</td>
                              <td className="px-2 py-1 text-white/45 break-all">
                                {[
                                  [
                                    p.service_id && `svc=${p.service_id}`,
                                    p.instance_id && `inst=${p.instance_id}`,
                                    p.host_id && `host=${p.host_id}`,
                                    p.node_id && `node=${p.node_id}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" "),
                                  p.labels && Object.keys(p.labels).length > 0
                                    ? `labels=${JSON.stringify(p.labels)}`
                                    : "",
                                  p.tags && Object.keys(p.tags).length > 0 ? `tags=${JSON.stringify(p.tags)}` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
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
