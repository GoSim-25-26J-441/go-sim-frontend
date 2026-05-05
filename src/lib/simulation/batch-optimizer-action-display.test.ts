import { describe, expect, it } from "vitest";
import { describeOptimizerActionForReplay } from "./batch-optimizer-action-display";

describe("describeOptimizerActionForReplay", () => {
  it("maps numeric ordinals 1–12 to backend-normalized names", () => {
    expect(describeOptimizerActionForReplay({ action: 1 }).primary).toBe("SERVICE_REPLICA_SCALE_UP");
    expect(describeOptimizerActionForReplay({ action: 2 }).primary).toBe("SERVICE_REPLICA_SCALE_DOWN");
    expect(describeOptimizerActionForReplay({ action: 3 })).toEqual({
      primary: "SERVICE_CPU_INCREASE",
      diagnostic: "ordinal 3",
    });
    expect(describeOptimizerActionForReplay({ action: 5 }).primary).toBe("SERVICE_MEMORY_INCREASE");
    expect(describeOptimizerActionForReplay({ action: 6 }).primary).toBe("SERVICE_MEMORY_DECREASE");
    expect(describeOptimizerActionForReplay({ action: 7 }).primary).toBe("HOST_SCALE_OUT");
    expect(describeOptimizerActionForReplay({ action: 8 }).primary).toBe("HOST_SCALE_IN");
    expect(describeOptimizerActionForReplay({ action: 9 }).primary).toBe("HOST_CPU_INCREASE");
    expect(describeOptimizerActionForReplay({ action: 10 }).primary).toBe("HOST_CPU_DECREASE");
    expect(describeOptimizerActionForReplay({ action: 11 }).primary).toBe("HOST_MEMORY_INCREASE");
    expect(describeOptimizerActionForReplay({ action: 12 }).primary).toBe("HOST_MEMORY_DECREASE");
  });

  it("uses ACTION_<n> for unknown ordinals beyond 12", () => {
    expect(describeOptimizerActionForReplay({ action: 13 }).primary).toBe("ACTION_13");
  });

  it("accepts uppercase engine string tokens", () => {
    expect(describeOptimizerActionForReplay({ action: "SERVICE_CPU_DECREASE" }).primary).toBe(
      "SERVICE_CPU_DECREASE"
    );
    expect(describeOptimizerActionForReplay({ action: "HOST_SCALE_OUT" }).primary).toBe("HOST_SCALE_OUT");
  });

  it("falls back when empty", () => {
    expect(describeOptimizerActionForReplay(undefined).primary).toBe("—");
  });
});
