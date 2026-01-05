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

