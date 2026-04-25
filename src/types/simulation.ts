// Simulation types matching simulation-core data structures

export type SimulationStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface SimulationRun {
  id: string;
  name: string;
  status: SimulationStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  config: SimulationConfig;
  results?: SimulationResults;
  error?: string;
}

export interface SimulationConfig {
  nodes: number;
  workload: {
    concurrent_users: number;
    rps_target?: number;
    duration_seconds: number;
    ramp_up_seconds?: number;
  };
  resources: {
    vcpu_per_node: number;
    memory_gb_per_node: number;
  };
  scenario?: string;
  description?: string;
}

export interface SimulationResults {
  summary: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    avg_rps: number;
    peak_rps: number;
  };
  node_metrics: NodeMetrics[];
  time_series: TimeSeriesData[];
  workload_metrics: WorkloadMetrics;
  optimization?: OptimizationResult;
}

// Optimization loop data structures (matching simulation-core/internal/improvement)
export interface OptimizationResult {
  best_config?: SimulationConfig;
  best_score: number;
  best_run_id?: string;
  iterations: number;
  history: OptimizationStep[];
  converged: boolean;
  convergence_reason?: string;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  duration_seconds?: number;
  objective_function?: string; // e.g., "p95_latency_ms", "throughput", "cost"
}

export interface OptimizationStep {
  iteration: number;
  score: number;
  config: SimulationConfig;
  run_id?: string;
  status?: "pending" | "running" | "completed" | "failed";
  metrics?: {
    p95_latency_ms?: number;
    p99_latency_ms?: number;
    avg_latency_ms?: number;
    throughput_rps?: number;
    error_rate?: number;
    cpu_utilization?: number;
    memory_utilization?: number;
  };
}

export interface NodeMetrics {
  node_id: string;
  spec: {
    vcpu: number;
    memory_gb: number;
    label: string;
  };
  avg_cpu_util_pct: number;
  avg_mem_util_pct: number;
  peak_cpu_util_pct: number;
  peak_mem_util_pct: number;
  network_io_mbps: number;
}

export interface TimeSeriesData {
  timestamp: string;
  cpu_util_pct: number;
  mem_util_pct: number;
  rps: number;
  latency_ms: number;
  concurrent_users: number;
  error_rate: number;
}

export interface WorkloadMetrics {
  concurrent_users: {
    min: number;
    max: number;
    avg: number;
  };
  rps: {
    min: number;
    max: number;
    avg: number;
  };
  latency: {
    min_ms: number;
    max_ms: number;
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
  };
}

// --- Simulation run dashboard types (SSE + persisted metrics) ---

export type SimulationEventType =
  | "status_change"
  | "metric_update"
  | "metrics_snapshot"
  | "optimization_progress"
  | "optimization_step"
  | "complete"
  | "error";

export type SimulationMetricLabelKey =
  | "service"
  | "endpoint"
  | "instance"
  | "host"
  | "broker"
  | "origin"
  | "traffic_class"
  | "source_kind"
  | "reason"
  | "is_retry"
  | "attempt"
  | "broker_service"
  | "topic"
  | "partition"
  | "subscriber"
  | "consumer_group"
  | "consumer_target"
  | "strategy"
  | "host_zone"
  | "requested_zone"
  | "service_id"
  | "host_id"
  | "instance_id"
  | "node"
  | "node_id"
  | (string & {});

export type SimulationMetricLabels = Partial<
  Record<SimulationMetricLabelKey, string | number | boolean | undefined>
>;

export interface ServiceMetricSnapshot {
  service_name: string;
  request_count?: number;
  error_count?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  latency_mean_ms?: number;
  cpu_utilization?: number;
  memory_utilization?: number;
  active_replicas?: number;
  concurrent_requests?: number;
  queue_length?: number;
  queue_wait_p50_ms?: number;
  queue_wait_p95_ms?: number;
  queue_wait_p99_ms?: number;
  queue_wait_mean_ms?: number;
  processing_latency_p50_ms?: number;
  processing_latency_p95_ms?: number;
  processing_latency_p99_ms?: number;
  processing_latency_mean_ms?: number;
  [key: string]: unknown;
}

export interface EndpointRequestStat {
  service_name: string;
  endpoint_path: string;
  request_count?: number;
  error_count?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  latency_mean_ms?: number;
  root_latency_p50_ms?: number;
  root_latency_p95_ms?: number;
  root_latency_p99_ms?: number;
  root_latency_mean_ms?: number;
  queue_wait_p50_ms?: number;
  queue_wait_p95_ms?: number;
  queue_wait_p99_ms?: number;
  queue_wait_mean_ms?: number;
  processing_latency_p50_ms?: number;
  processing_latency_p95_ms?: number;
  processing_latency_p99_ms?: number;
  processing_latency_mean_ms?: number;
  [key: string]: unknown;
}

export interface HostMetricSnapshot {
  host_id: string;
  cpu_utilization?: number;
  memory_utilization?: number;
  [key: string]: unknown;
}

export interface QueueResourceSnapshot {
  /** Preferred backend field. */
  broker: string;
  /** Backward-compatible alias preserved by frontend normalization. */
  broker_service: string;
  topic: string;
  depth?: number;
  in_flight?: number;
  max_concurrency?: number;
  consumer_target?: string;
  oldest_message_age_ms?: number;
  drop_count?: number;
  redelivery_count?: number;
  dlq_count?: number;
  [key: string]: unknown;
}

export interface TopicResourceSnapshot {
  /** Preferred backend field. */
  broker: string;
  /** Backward-compatible alias preserved by frontend normalization. */
  broker_service: string;
  topic: string;
  partition?: string;
  subscriber?: string;
  consumer_group?: string;
  depth?: number;
  in_flight?: number;
  max_concurrency?: number;
  consumer_target?: string;
  oldest_message_age_ms?: number;
  drop_count?: number;
  redelivery_count?: number;
  dlq_count?: number;
  [key: string]: unknown;
}

export interface ClusterPlacementHostResource {
  host_id: string;
  cpu_cores?: number;
  memory_gb?: number;
  cpu_utilization?: number;
  memory_utilization?: number;
}

export interface ClusterPlacementServiceResource {
  service_id: string;
  replicas?: number;
  cpu_cores?: number;
  memory_mb?: number;
}

export interface ClusterPlacementInstance {
  service_id: string;
  instance_id?: string;
  host_id?: string;
  lifecycle?: string;
  cpu_cores?: number;
  memory_mb?: number;
  cpu_utilization?: number;
  memory_utilization?: number;
  active_requests?: number;
  queue_length?: number;
}

export interface ClusterPlacementResources {
  hosts: ClusterPlacementHostResource[];
  services: ClusterPlacementServiceResource[];
  placements: ClusterPlacementInstance[];
  queues?: QueueResourceSnapshot[];
  topics?: TopicResourceSnapshot[];
}

export interface SnapshotMetrics {
  total_requests?: number;
  ingress_requests?: number;
  internal_requests?: number;
  retry_attempts?: number;
  attempt_error_rate?: number;
  ingress_error_rate?: number;
  total_errors?: number;
  total_duration_ms?: number;
  failed_requests?: number;
  successful_requests?: number;
  throughput_rps?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  latency_mean_ms?: number;
  locality_hit_rate?: number;
  same_zone_request_count_total?: number;
  cross_zone_request_count_total?: number;
  cross_zone_request_fraction?: number;
  cross_zone_latency_penalty_ms_total?: number;
  cross_zone_latency_penalty_ms_mean?: number;
  same_zone_latency_penalty_ms_total?: number;
  same_zone_latency_penalty_ms_mean?: number;
  external_latency_ms_total?: number;
  external_latency_ms_mean?: number;
  topology_latency_penalty_ms_total?: number;
  topology_latency_penalty_ms_mean?: number;
  queue_enqueue_count_total?: number;
  queue_dequeue_count_total?: number;
  queue_drop_count_total?: number;
  queue_redelivery_count_total?: number;
  queue_dlq_count_total?: number;
  queue_depth_sum?: number;
  queue_oldest_message_age_ms?: number;
  max_queue_depth?: number;
  queue_drop_rate?: number;
  topic_publish_count_total?: number;
  topic_deliver_count_total?: number;
  topic_drop_count_total?: number;
  topic_redelivery_count_total?: number;
  topic_dlq_count_total?: number;
  topic_backlog_depth_sum?: number;
  topic_consumer_lag_sum?: number;
  topic_oldest_message_age_ms?: number;
  max_topic_backlog_depth?: number;
  max_topic_consumer_lag?: number;
  topic_drop_rate?: number;
  endpoint_request_stats?: EndpointRequestStat[];
  service_metrics?: ServiceMetricSnapshot[];
  [key: string]: unknown;
}

export interface MetricsSummary extends SnapshotMetrics {
  final_config?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  summary_data?: Record<string, unknown>;
}

export interface MetricPoint {
  time?: string;
  timestamp?: string;
  value: number;
  metric?: string;
  labels?: SimulationMetricLabels;
  tags?: Record<string, unknown>;
  service_id?: string;
  instance_id?: string;
  host_id?: string;
  node_id?: string;
}

export interface MetricTimeseries {
  metric: string;
  points: MetricPoint[];
}

export interface MetricsResponse {
  run_id: string;
  summary?: MetricsSummary;
  timeseries?: MetricTimeseries[];
  metrics?: SnapshotMetrics;
  [key: string]: unknown;
}

export interface MetricUpdatePayload {
  metric?: string;
  value?: number;
  timestamp?: string;
  labels?: SimulationMetricLabels;
  host_id?: string;
  service_id?: string;
  service_name?: string;
}

export interface MetricsSnapshotEventData {
  metrics?: SnapshotMetrics;
  host_metrics?: HostMetricSnapshot[];
  resources?: ClusterPlacementResources;
}

export interface OptimizationStepConfig {
  services?: Array<Record<string, unknown> & { id: string; replicas?: number; cpu_cores?: number; memory_mb?: number }>;
  workload?: Array<Record<string, unknown>>;
  hosts?: unknown[];
  [key: string]: unknown;
}

export interface OptimizationStepEvent {
  iteration_index: number;
  target_p95_ms: number;
  score_p95_ms: number;
  reason?: string;
  reason_details?: Record<string, unknown>;
  previous_config?: OptimizationStepConfig;
  current_config?: OptimizationStepConfig;
  [key: string]: unknown;
}

