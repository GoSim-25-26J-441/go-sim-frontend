import { describe, expect, it } from "vitest";
import {
  defaultBatchRecommendation,
  patchTouchesHostBounds,
  shouldWarnHostBoundsWithoutHostActions,
} from "./BatchRecommendationFields";
import { cloneDirectional, directionalFlagsForPreset, hostActionsEnabled } from "@/lib/simulation/batch-scaling-actions";

describe("batch recommendation action scope", () => {
  it("defaults include host actions (service_plus_host preset)", () => {
    const br = defaultBatchRecommendation(100);
    expect(br.action_preset).toBe("service_plus_host");
    expect(br.actions.host_scale_out && br.actions.host_scale_in).toBe(true);
  });

  it("service_only is explicit — host toggles off", () => {
    const d = directionalFlagsForPreset("service_only");
    expect(d.host_scale_out).toBe(false);
    expect(d.service_scale_out).toBe(true);
  });

  it("warns when host fleet bounds imply hosts but host actions disabled", () => {
    const br = defaultBatchRecommendation(100);
    const narrow = {
      ...br,
      action_preset: "custom" as const,
      actions: { ...directionalFlagsForPreset("service_only") },
    };
    expect(shouldWarnHostBoundsWithoutHostActions(narrow)).toBe(true);
  });

  it("no warning when host actions on with default bounds", () => {
    const br = defaultBatchRecommendation(100);
    expect(shouldWarnHostBoundsWithoutHostActions(br)).toBe(false);
  });

  it("patchTouchesHostBounds detects host fleet and capacity fields", () => {
    expect(patchTouchesHostBounds({ max_hosts: 6 })).toBe(true);
    expect(patchTouchesHostBounds({ host_cpu_low: 0.2 })).toBe(true);
    expect(patchTouchesHostBounds({ evaluation_duration_ms: 5000 })).toBe(false);
  });

  it("document host auto-enable merge: host bounds + service_only actions keeps host off until explicit actions patch", () => {
    const base = defaultBatchRecommendation(100);
    const serviceOnly = {
      ...base,
      action_preset: "custom" as const,
      actions: cloneDirectional(directionalFlagsForPreset("service_only")),
    };
    expect(hostActionsEnabled(serviceOnly.actions)).toBe(false);
    const merged = {
      ...serviceOnly.actions,
      host_scale_out: true,
      host_scale_in: true,
      host_cpu_up: true,
      host_cpu_down: true,
      host_memory_up: true,
      host_memory_down: true,
    };
    expect(hostActionsEnabled(merged)).toBe(true);
  });
});
