import { describe, expect, it } from "vitest";
import {
  allowedActionsFromDirectional,
  BATCH_BACKEND_ACTION_NAME_BY_ORDINAL,
  BATCH_BACKEND_ACTION_ORDER,
  BATCH_BROKER_ACTIONS_READY,
  directionalFlagsForPreset,
} from "./batch-scaling-actions";

const FULL_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("allowed_actions ordinals (backend 1–12)", () => {
  it("defines twelve backend rows in order", () => {
    expect(BATCH_BACKEND_ACTION_ORDER.length).toBe(12);
    expect(BATCH_BACKEND_ACTION_ORDER.map((r) => r.ordinal)).toEqual(FULL_12);
  });

  it("service_only serializes to [1,2,3,4,5,6]", () => {
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("service_only"))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("host_only serializes to [7,8,9,10,11,12]", () => {
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("host_only"))).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("service_plus_host and all_actions serialize to full twelve ordinals", () => {
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("service_plus_host"))).toEqual(FULL_12);
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("all_actions"))).toEqual(FULL_12);
  });

  it("replica_focus enables only ordinals 1 and 2", () => {
    const d = directionalFlagsForPreset("replica_focus");
    expect(allowedActionsFromDirectional(d)).toEqual([1, 2]);
    expect(d.host_scale_out).toBe(false);
  });

  it("maps backend names for ordinals 1–12", () => {
    expect(BATCH_BACKEND_ACTION_NAME_BY_ORDINAL).toMatchObject({
      1: "SERVICE_REPLICA_SCALE_UP",
      2: "SERVICE_REPLICA_SCALE_DOWN",
      3: "SERVICE_CPU_INCREASE",
      4: "SERVICE_CPU_DECREASE",
      5: "SERVICE_MEMORY_INCREASE",
      6: "SERVICE_MEMORY_DECREASE",
      7: "HOST_SCALE_OUT",
      8: "HOST_SCALE_IN",
      9: "HOST_CPU_INCREASE",
      10: "HOST_CPU_DECREASE",
      11: "HOST_MEMORY_INCREASE",
      12: "HOST_MEMORY_DECREASE",
    });
  });

  it("broker_concurrency does not add ordinals beyond 12 while broker actions are not ready", () => {
    expect(BATCH_BROKER_ACTIONS_READY).toBe(false);
    expect(allowedActionsFromDirectional(directionalFlagsForPreset("broker_concurrency"))).toEqual(FULL_12);
  });
});
