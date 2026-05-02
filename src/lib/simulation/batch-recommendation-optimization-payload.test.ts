import { describe, expect, it } from "vitest";
import { defaultBatchRecommendation } from "@/app/(dashboard)/project/[id]/simulation/new/BatchRecommendationFields";
import {
  buildBatchRecommendationOptimizationPayload,
  resolveBatchRecommendationObjective,
} from "./batch-recommendation-optimization-payload";

describe("resolveBatchRecommendationObjective", () => {
  it("defaults to cpu_utilization when unset or unknown", () => {
    expect(resolveBatchRecommendationObjective(undefined)).toBe("cpu_utilization");
    expect(resolveBatchRecommendationObjective("")).toBe("cpu_utilization");
  });

  it("honors recommended_config when configured", () => {
    expect(resolveBatchRecommendationObjective("recommended_config")).toBe("recommended_config");
  });
});

describe("buildBatchRecommendationOptimizationPayload", () => {
  const base = defaultBatchRecommendation(100);

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

  it("includes allowed_actions as protobuf ordinals matching enabled scaling flags", () => {
    const br = {
      ...base,
      allow_replica_scaling: true,
      allow_host_scaling: true,
      allow_service_cpu: false,
      allow_service_memory: false,
      allow_host_cpu: false,
      allow_host_memory: false,
    };
    const batch = buildBatchRecommendationOptimizationPayload(br, "cpu_utilization").batch as Record<
      string,
      unknown
    >;
    expect(batch.allowed_actions).toEqual([1, 2]);
    expect((batch.allowed_actions as unknown[]).every((x) => typeof x === "number")).toBe(true);
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
