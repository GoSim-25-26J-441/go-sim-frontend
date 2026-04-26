import { describe, expect, it } from "vitest";
import {
  buildOnlineConfigModel,
  buildPoliciesPatchPayloadFromModel,
  buildServicePatchPayloadFromModel,
  buildWorkloadPatchPayloadFromModel,
} from "./online-config-model";

describe("buildOnlineConfigModel", () => {
  it("classifies runtime editable fields and exposes service/workload observed values", () => {
    const model = buildOnlineConfigModel({
      latestOptimizationConfig: {
        services: [{ id: "checkout", replicas: 2 }],
        workload: [{ pattern_key: "burst", rate_rps: 30 }],
      },
      latestResources: {
        hosts: [],
        services: [{ service_id: "payment" }],
        placements: [],
      },
      scenarioServiceIds: ["inventory"],
      scenarioWorkloadPatternKeys: ["steady"],
    });

    const runtimeKeys = new Set(model.byGroup.runtimeEditable.map((f) => f.key));
    expect(runtimeKeys.has("services[].id")).toBe(true);
    expect(runtimeKeys.has("services[].replicas")).toBe(true);
    expect(runtimeKeys.has("workload[].pattern_key")).toBe(true);
    expect(runtimeKeys.has("policies.autoscaling.scale_step")).toBe(true);

    const serviceIdField = model.byGroup.runtimeEditable.find((f) => f.key === "services[].id");
    expect(serviceIdField?.observedValues).toEqual(["checkout", "inventory", "payment"]);
    const patternField = model.byGroup.runtimeEditable.find((f) => f.key === "workload[].pattern_key");
    expect(patternField?.observedValues).toEqual(["burst", "steady"]);
  });

  it("tracks lease control metadata and renewal action", () => {
    const model = buildOnlineConfigModel({
      runMetadata: { lease_ttl_ms: 30000 },
      leaseState: {
        autoRenewEnabled: true,
        lastRenewalStatus: "ok",
        nextRenewalAtMs: 123456,
      },
    });

    const ttl = model.byGroup.leaseControl.find((f) => f.key === "lease_ttl_ms");
    expect(ttl?.observedValue).toBe(30000);
    const renewAction = model.byGroup.leaseControl.find((f) => f.key === "actions.renew_online_lease");
    expect(renewAction?.action?.endpoint).toContain("/online/renew-lease");
  });

  it("marks create-time locked controller fields and topology/locality guardrail extras", () => {
    const model = buildOnlineConfigModel({
      runMetadata: {
        control_interval_ms: 1000,
        min_hosts: 1,
        max_hosts: 4,
        min_locality_hit_rate: 0.8,
      },
      latestOptimizationConfig: {
        services: [],
        topology_guardrail_enabled: true,
      },
    });

    const locked = model.byGroup.createTimeLocked;
    expect(locked.some((f) => f.key === "control_interval_ms")).toBe(true);
    expect(locked.some((f) => f.key === "min_hosts")).toBe(true);
    expect(locked.some((f) => f.key === "max_hosts")).toBe(true);
    expect(locked.some((f) => f.key === "drain_timeout_ms")).toBe(true);
    expect(locked.some((f) => f.key === "memory_downsize_headroom_mb")).toBe(true);
    expect(locked.some((f) => f.key === "min_locality_hit_rate")).toBe(true);
    expect(locked.some((f) => f.key === "topology_guardrail_enabled")).toBe(true);
  });

  it("prefers metadata.optimization_config values for locked settings", () => {
    const model = buildOnlineConfigModel({
      runMetadata: {
        target_p95_latency_ms: 250,
        max_controller_steps: 20,
      },
      optimizationConfigMetadata: {
        target_p95_latency_ms: 180,
        max_controller_steps: 8,
      },
    });
    const target = model.byGroup.createTimeLocked.find((f) => f.key === "target_p95_latency_ms");
    const maxSteps = model.byGroup.createTimeLocked.find((f) => f.key === "max_controller_steps");
    expect(target?.observedValue).toBe(180);
    expect(maxSteps?.observedValue).toBe(8);
  });

  it("includes canonical locked keys without requiring legacy aliases", () => {
    const model = buildOnlineConfigModel({ runMetadata: {} });
    const lockedKeys = new Set(model.byGroup.createTimeLocked.map((f) => f.key));
    expect(lockedKeys.has("drain_timeout_ms")).toBe(true);
    expect(lockedKeys.has("memory_downsize_headroom_mb")).toBe(true);
    expect(lockedKeys.has("mode")).toBe(true);
    expect(lockedKeys.has("objective")).toBe(true);
    expect(lockedKeys.has("host_drain_timeout_ms")).toBe(false);
    expect(lockedKeys.has("memory_headroom_mb")).toBe(false);
  });

  it("builds service/workload/policy patch payloads from runtime editable model", () => {
    const model = buildOnlineConfigModel({});
    const servicePayload = buildServicePatchPayloadFromModel(
      model,
      [{ id: "checkout", cpu_cores: 1.5 }],
      { checkout: 2 }
    );
    expect(servicePayload.ok).toBe(true);
    if (servicePayload.ok) {
      expect(servicePayload.value[0]).toMatchObject({ id: "checkout", replicas: 2, cpu_cores: 1.5 });
    }

    const workloadPayload = buildWorkloadPatchPayloadFromModel(model, [{ pattern_key: "steady", rate_rps: 10 }]);
    expect(workloadPayload.ok).toBe(true);

    const policyPayload = buildPoliciesPatchPayloadFromModel(model, {
      autoscaling: { enabled: true, target_cpu_util: 70, scale_step: 2 },
    });
    expect(policyPayload.ok).toBe(true);
    if (policyPayload.ok) {
      expect(policyPayload.value.autoscaling?.target_cpu_util).toBeCloseTo(0.7);
    }
  });
});
