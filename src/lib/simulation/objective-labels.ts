/**
 * Human-readable labels for online primary targets and run metadata.objective.
 * Engine uses the same keys as optimization_target_primary (e.g. p95_latency, not p95_latency_ms).
 */
const ONLINE_TARGET_LABELS: Record<string, string> = {
  p95_latency: "P95 latency",
  p95_latency_ms: "P95 latency",
  cpu_utilization: "CPU utilization",
  memory_utilization: "Memory utilization",
};

export function formatOnlineOptimizationTargetLabel(key: string | undefined | null): string {
  if (key == null || String(key).trim() === "") return "—";
  const k = String(key);
  return ONLINE_TARGET_LABELS[k] ?? k.replace(/_/g, " ");
}

/** Format best_score / optimization progress for online runs by metadata.objective (aligned with optimization_target_primary). */
export function formatOnlineOptimizationBestScore(
  value: number,
  objective: string | undefined | null
): string {
  const o = objective ?? "";
  if (o === "cpu_utilization" || o === "memory_utilization") {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (o === "p95_latency" || o === "p95_latency_ms") {
    return `${value.toFixed(2)} ms`;
  }
  return value.toFixed(4);
}

/** True when metadata indicates an interactive online run (not batch / legacy batch). */
export function isInteractiveOnlineRunMode(mode: unknown): boolean {
  return mode === "online" || mode === "online_optimization";
}
