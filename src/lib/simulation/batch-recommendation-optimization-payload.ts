import type { BatchRecommendationFormState } from "@/app/(dashboard)/project/[id]/simulation/new/BatchRecommendationFields";
import { allowedActionsFromFlags } from "@/lib/simulation/batch-scaling-actions";

export type BatchRecommendationOptimizationObjective = "recommended_config" | "cpu_utilization";

/** Mirrors `NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE` resolution used at create-run time. */
export function resolveBatchRecommendationObjective(
  envValue: string | undefined
): BatchRecommendationOptimizationObjective {
  return envValue === "recommended_config" ? "recommended_config" : "cpu_utilization";
}

/**
 * Offline fleet / batch beam optimization payload for POST …/projects/:id/runs.
 * Sends explicit `optimization.mode: "batch"` (BFF hint; stripped before simulation-core).
 */
export function buildBatchRecommendationOptimizationPayload(
  br: BatchRecommendationFormState,
  objective: BatchRecommendationOptimizationObjective
): Record<string, unknown> {
  const maxP99Ms =
    br.ui_mode === "quick" ? Math.max(1000, Math.round(br.max_p95_latency_ms * 2)) : br.max_p99_latency_ms;
  return {
    mode: "batch",
    objective,
    online: false,
    evaluation_duration_ms: br.evaluation_duration_ms,
    max_evaluations: br.max_evaluations,
    batch: {
      max_p95_latency_ms: br.max_p95_latency_ms,
      max_p99_latency_ms: maxP99Ms,
      max_error_rate: br.max_error_rate,
      min_throughput_rps: br.min_throughput_rps,
      service_cpu_utilization_band: { low: br.service_cpu_low, high: br.service_cpu_high },
      service_memory_utilization_band: { low: br.service_mem_low, high: br.service_mem_high },
      host_cpu_utilization_band: { low: br.host_cpu_low, high: br.host_cpu_high },
      host_memory_utilization_band: { low: br.host_mem_low, high: br.host_mem_high },
      min_hosts: br.min_hosts,
      max_hosts: br.max_hosts,
      min_replicas_per_service: br.min_replicas_per_service,
      max_replicas_per_service: br.max_replicas_per_service,
      min_cpu_cores_per_instance: br.min_cpu_cores_per_instance,
      max_cpu_cores_per_instance: br.max_cpu_cores_per_instance,
      min_memory_mb_per_instance: br.min_memory_mb_per_instance,
      max_memory_mb_per_instance: br.max_memory_mb_per_instance,
      min_host_cpu_cores: br.min_host_cpu_cores,
      max_host_cpu_cores: br.max_host_cpu_cores,
      min_host_memory_gb: br.min_host_memory_gb,
      max_host_memory_gb: br.max_host_memory_gb,
      beam_width: br.beam_width,
      max_search_depth: br.max_search_depth,
      max_neighbors_per_state: br.max_neighbors_per_state,
      reevaluations_per_candidate: br.reevaluations_per_candidate,
      infeasible_beam_width: br.infeasible_beam_width,
      freeze_workload: br.freeze_workload,
      freeze_policies: br.freeze_policies,
      allowed_actions: allowedActionsFromFlags(br),
    },
  };
}
