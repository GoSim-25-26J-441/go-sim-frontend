import { describe, expect, it } from "vitest";
import {
  normalizeAutoscalingTargetCpuToFraction,
  validateAndBuildServicePatchRows,
  validateAndNormalizePoliciesForPatch,
  validateWorkloadPatchRows,
} from "./online-runtime-payload-validation";

describe("online runtime payload validation", () => {
  it("requires replicas for service rows and can derive them", () => {
    const ok = validateAndBuildServicePatchRows(
      [{ id: "checkout", cpu_cores: 1.5 }],
      { checkout: 2 }
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value[0]).toMatchObject({ id: "checkout", replicas: 2, cpu_cores: 1.5 });
    }

    const err = validateAndBuildServicePatchRows([{ id: "payment", memory_mb: 512 }], {});
    expect(err.ok).toBe(false);
    if (!err.ok) expect(err.error).toContain("Replicas are required");
  });

  it("validates workload rows", () => {
    const good = validateWorkloadPatchRows([{ pattern_key: "steady", rate_rps: 25 }]);
    expect(good.ok).toBe(true);

    const bad = validateWorkloadPatchRows([{ pattern_key: "", rate_rps: 25 }]);
    expect(bad.ok).toBe(false);
  });

  it("normalizes autoscaling target cpu to fraction and validates scale step", () => {
    expect(normalizeAutoscalingTargetCpuToFraction(70)).toBeCloseTo(0.7);
    expect(normalizeAutoscalingTargetCpuToFraction(0.7)).toBeCloseTo(0.7);

    const good = validateAndNormalizePoliciesForPatch({
      autoscaling: { enabled: true, target_cpu_util: 70, scale_step: 2 },
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value.autoscaling?.target_cpu_util).toBeCloseTo(0.7);
      expect(good.value.autoscaling?.scale_step).toBe(2);
    }

    const bad = validateAndNormalizePoliciesForPatch({
      autoscaling: { enabled: true, target_cpu_util: 70, scale_step: 0 },
    });
    expect(bad.ok).toBe(false);
  });
});

