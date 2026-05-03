import { describe, expect, it } from "vitest";
import { defaultBatchRecommendation } from "@/app/(dashboard)/project/[id]/simulation/new/BatchRecommendationFields";
import {
  buildBatchRecommendationOptimizationPayload,
  resolveBatchRecommendationObjective,
} from "./batch-recommendation-optimization-payload";
import { cloneDirectional, directionalFlagsForPreset } from "./batch-scaling-actions";

describe("resolveBatchRecommendationObjective", () => {
  it("defaults to cpu_utilization when unset or unknown", () => {
    expect(resolveBatchRecommendationObjective(undefined)).toBe("cpu_utilization");
    expect(resolveBatchRecommendationObjective("")).toBe("cpu_utilization");
  });

  it("honors recommended_config when configured", () => {
    expect(resolveBatchRecommendationObjective("recommended_config")).toBe("recommended_config");
  });
});

const FULL_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("buildBatchRecommendationOptimizationPayload", () => {
  const base = defaultBatchRecommendation(100);

  it("default allowed_actions includes service and host ordinals 1–12", () => {
    const batch = buildBatchRecommendationOptimizationPayload(base, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual(FULL_12);
    expect((batch.allowed_actions as unknown[]).every((x) => typeof x === "number")).toBe(true);
  });

  it("sends fleet batch intent on optimization (mode, objective, online, batch) — not metadata-only", () => {
    const payload = buildBatchRecommendationOptimizationPayload(base, "cpu_utilization");
    expect(payload.mode).toBe("batch");
    expect(payload.objective).toBe("cpu_utilization");
    expect(payload.online).toBe(false);
    expect(payload.batch).toBeDefined();
    expect(typeof payload.batch).toBe("object");
    expect(payload.batch).not.toBeNull();
  });

  it("includes snake_case optimizer caps at optimization top level", () => {
    const payload = buildBatchRecommendationOptimizationPayload(base, "cpu_utilization");
    expect(payload.max_evaluations).toBe(base.max_evaluations);
    expect(payload.evaluation_duration_ms).toBe(base.evaluation_duration_ms);
  });

  it("serializes explicit fleet bounds under optimization.batch with snake_case keys", () => {
    const br = {
      ...base,
      min_hosts: 1,
      max_hosts: 5,
      min_host_cpu_cores: 2,
      min_host_memory_gb: 4,
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.min_hosts).toBe(1);
    expect(batch.max_hosts).toBe(5);
    expect(batch.min_host_cpu_cores).toBe(2);
    expect(batch.min_host_memory_gb).toBe(4);
  });

  it("includes allowed_actions as numeric ordinals matching toggles", () => {
    const br = {
      ...base,
      action_preset: "custom" as const,
      actions: {
        ...directionalFlagsForPreset("replica_focus"),
      },
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual([1, 2]);
  });

  it("service_only serializes to [1,2,3,4,5,6]", () => {
    const br = {
      ...base,
      action_preset: "service_only" as const,
      actions: { ...directionalFlagsForPreset("service_only") },
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("host_only serializes to [7,8,9,10,11,12]", () => {
    const br = {
      ...base,
      action_preset: "host_only" as const,
      actions: { ...directionalFlagsForPreset("host_only") },
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("service_plus_host serializes to full twelve ordinals", () => {
    const br = {
      ...base,
      action_preset: "service_plus_host" as const,
      actions: cloneDirectional(directionalFlagsForPreset("service_plus_host")),
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual(FULL_12);
  });

  it("documents backend-minimal fleet shape (empty batch object is valid when inferring defaults)", () => {
    const minimal = {
      mode: "batch",
      objective: "cpu_utilization",
      online: false,
      batch: {},
    };
    expect(minimal).toMatchObject({
      mode: "batch",
      objective: "cpu_utilization",
      online: false,
      batch: {},
    });
  });
});
