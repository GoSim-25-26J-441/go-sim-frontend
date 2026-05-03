import { describe, expect, it } from "vitest";
import { buildRealtimeInteractiveOnlineOptimizationCore } from "./interactive-online-optimization-payload";

describe("buildRealtimeInteractiveOnlineOptimizationCore", () => {
  it("matches interactive unbounded contract for CPU target", () => {
    const o = buildRealtimeInteractiveOnlineOptimizationCore("cpu_utilization");
    expect(o).toEqual({
      online: true,
      objective: "cpu_utilization",
      optimization_target_primary: "cpu_utilization",
      max_controller_steps: 0,
      max_noop_intervals: -1,
      allow_unbounded_online: true,
      max_online_duration_ms: 0,
    });
  });

  it("uses p95_latency for both objective fields", () => {
    const o = buildRealtimeInteractiveOnlineOptimizationCore("p95_latency");
    expect(o.objective).toBe("p95_latency");
    expect(o.optimization_target_primary).toBe("p95_latency");
  });

  it("switches to bounded wall-clock when duration > 0", () => {
    const o = buildRealtimeInteractiveOnlineOptimizationCore("memory_utilization", 60_000);
    expect(o.max_online_duration_ms).toBe(60_000);
    expect(o.allow_unbounded_online).toBe(false);
    expect(o.max_controller_steps).toBe(0);
  });

  it("does not include lease_ttl_ms", () => {
    const o = buildRealtimeInteractiveOnlineOptimizationCore("p95_latency");
    expect("lease_ttl_ms" in o).toBe(false);
  });
});
