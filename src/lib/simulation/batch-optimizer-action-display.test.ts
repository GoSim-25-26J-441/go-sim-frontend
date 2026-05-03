import { describe, expect, it } from "vitest";
import { describeOptimizerActionForReplay } from "./batch-optimizer-action-display";

describe("describeOptimizerActionForReplay", () => {
  it("maps numeric ordinals 1–6 to display names with diagnostic", () => {
    expect(describeOptimizerActionForReplay({ action: 3 })).toEqual({
      primary: "SERVICE_CPU_SCALE",
      diagnostic: "ordinal 3",
    });
  });

  it("accepts string action tokens", () => {
    expect(describeOptimizerActionForReplay({ action: "SERVICE_SCALE_OUT" }).primary).toBe("SERVICE_SCALE_OUT");
  });

  it("falls back when empty", () => {
    expect(describeOptimizerActionForReplay(undefined).primary).toBe("—");
  });
});
