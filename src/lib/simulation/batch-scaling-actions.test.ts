import { describe, expect, it } from "vitest";
import {
  allowedActionsFromDirectional,
  coarseFlagsFromDirectional,
  directionalFlagsForPreset,
  hostActionsEnabled,
} from "./batch-scaling-actions";

describe("directional → coarse ordinals (backend contract 1–6)", () => {
  it("default service_plus_host enables all six ordinals", () => {
    const d = directionalFlagsForPreset("service_plus_host");
    expect(allowedActionsFromDirectional(d)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("service_only omits host ordinals (2,5,6)", () => {
    const d = directionalFlagsForPreset("service_only");
    expect(allowedActionsFromDirectional(d)).toEqual([1, 3, 4]);
    expect(hostActionsEnabled(d)).toBe(false);
  });

  it("host_only omits service ordinals (1,3,4)", () => {
    const d = directionalFlagsForPreset("host_only");
    expect(allowedActionsFromDirectional(d)).toEqual([2, 5, 6]);
  });

  it("all_actions matches service_plus_host while broker ordinals are absent", () => {
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("all_actions"))).toEqual(
      allowedActionsFromDirectional(directionalFlagsForPreset("service_plus_host"))
    );
  });

  it("broker_concurrency preset matches service_plus_host until broker ordinals exist", () => {
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("broker_concurrency"))).toEqual(
      [1, 2, 3, 4, 5, 6]
    );
  });

  it("one direction on a pair still enables the coarse flag (replica out only → ordinal 1)", () => {
    const d = {
      ...directionalFlagsForPreset("host_only"),
      service_scale_out: true,
      service_scale_in: false,
    };
    const c = coarseFlagsFromDirectional(d);
    expect(c.allow_replica_scaling).toBe(true);
    expect(allowedActionsFromDirectional(d).includes(1)).toBe(true);
  });
});
