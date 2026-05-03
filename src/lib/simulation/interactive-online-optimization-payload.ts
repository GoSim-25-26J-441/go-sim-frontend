/**
 * Interactive online optimization (real-time / wall-clock): core optimization keys for POST create-run.
 * objective and optimization_target_primary must match the selected primary target (p95_latency | cpu_utilization | memory_utilization).
 */
export type OnlinePrimaryTarget = "p95_latency" | "cpu_utilization" | "memory_utilization";

export function buildRealtimeInteractiveOnlineOptimizationCore(
  primary: OnlinePrimaryTarget,
  boundedWallClockMs?: number | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    online: true,
    objective: primary,
    optimization_target_primary: primary,
    max_controller_steps: 0,
    max_noop_intervals: -1,
    allow_unbounded_online: true,
    max_online_duration_ms: 0,
  };
  const wall =
    boundedWallClockMs != null && Number.isFinite(boundedWallClockMs)
      ? Math.trunc(boundedWallClockMs)
      : 0;
  if (wall > 0) {
    out.max_online_duration_ms = wall;
    out.allow_unbounded_online = false;
  }
  return out;
}
