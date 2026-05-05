import { describe, expect, it } from "vitest";
import {
  defaultBatchRecommendation,
  hostFleetConstraintsConfigured,
  hostUtilizationTargetsDistinctFromService,
  shouldWarnHostBoundsWithoutHostActions,
} from "./BatchRecommendationFields";
import { cloneDirectional, directionalFlagsForPreset } from "@/lib/simulation/batch-scaling-actions";

describe("batch recommendation action scope", () => {
  it("defaults use service_plus_host preset with service and host ordinals enabled", () => {
    const br = defaultBatchRecommendation(100);
    expect(br.action_preset).toBe("service_plus_host");
    expect(br.actions.service_replica_scale_up && br.actions.host_scale_out).toBe(true);
  });

  it("does not warn on default: host context is set but host actions 7–12 are enabled", () => {
    const br = defaultBatchRecommendation(100);
    expect(hostUtilizationTargetsDistinctFromService(br)).toBe(true);
    expect(shouldWarnHostBoundsWithoutHostActions(br)).toBe(false);
  });

  it("replica_focus preset keeps only replica toggles and clears host actions", () => {
    const d = directionalFlagsForPreset("replica_focus");
    expect(d.service_cpu_increase).toBe(false);
    expect(d.service_replica_scale_up).toBe(true);
    expect(d.host_scale_out).toBe(false);
  });

  it("warns when host fleet bounds are set but all host allowed_actions are off", () => {
    const br = defaultBatchRecommendation(100);
    const narrow = {
      ...br,
      action_preset: "custom" as const,
      actions: cloneDirectional(directionalFlagsForPreset("replica_focus")),
    };
    expect(hostFleetConstraintsConfigured(narrow)).toBe(true);
    expect(shouldWarnHostBoundsWithoutHostActions(narrow)).toBe(true);
  });

  it("no warning when host fleet is neutral, utilization matches service, and host actions on", () => {
    const base = defaultBatchRecommendation(100);
    const br = {
      ...base,
      min_hosts: 1,
      max_hosts: 1,
      min_host_cpu_cores: 1,
      max_host_cpu_cores: 16,
      min_host_memory_gb: 1,
      max_host_memory_gb: 64,
      host_cpu_low: base.service_cpu_low,
      host_cpu_high: base.service_cpu_high,
      host_mem_low: base.service_mem_low,
      host_mem_high: base.service_mem_high,
    };
    expect(hostFleetConstraintsConfigured(br)).toBe(false);
    expect(hostUtilizationTargetsDistinctFromService(br)).toBe(false);
    expect(shouldWarnHostBoundsWithoutHostActions(br)).toBe(false);
  });

  it("warns when host utilization differs from service but host actions are all disabled", () => {
    const base = defaultBatchRecommendation(100);
    const br = {
      ...base,
      action_preset: "custom" as const,
      actions: cloneDirectional(directionalFlagsForPreset("service_only")),
    };
    expect(hostUtilizationTargetsDistinctFromService(br)).toBe(true);
    expect(shouldWarnHostBoundsWithoutHostActions(br)).toBe(true);
  });

  it("hostFleetConstraintsConfigured detects host-related fields", () => {
    expect(hostFleetConstraintsConfigured({ ...defaultBatchRecommendation(100), max_hosts: 6 })).toBe(true);
  });
});
