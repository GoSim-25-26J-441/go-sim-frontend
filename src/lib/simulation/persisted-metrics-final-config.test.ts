import { describe, expect, it } from "vitest";
import {
  placementStatusFromFinalConfig,
  resolveFinalConfigForPlacement,
} from "./persisted-metrics-final-config";

describe("resolveFinalConfigForPlacement", () => {
  it("prefers non-empty metrics summary final_config over run metadata", () => {
    const out = resolveFinalConfigForPlacement(
      { final_config: { placements: [{ service_id: "a" }] } },
      { hosts: [] },
    );
    expect(out).toEqual({ placements: [{ service_id: "a" }] });
  });

  it("falls back to run metadata when metrics summary final_config is empty object", () => {
    const meta = { placements: [] as unknown[] };
    const out = resolveFinalConfigForPlacement({ final_config: {} }, meta);
    expect(out).toBe(meta);
  });

  it("falls back when summary.final_config missing", () => {
    const meta = { x: 1 };
    expect(resolveFinalConfigForPlacement(undefined, meta)).toBe(meta);
  });
});

describe("placementStatusFromFinalConfig", () => {
  it("reports when placements present and non-empty", () => {
    expect(placementStatusFromFinalConfig({ placements: [{ service_id: "s" }] })).toBe("reported");
  });

  it("empty when placements is empty array", () => {
    expect(placementStatusFromFinalConfig({ placements: [] })).toBe("empty");
  });

  it("no_placement_key when object has keys but no placements field", () => {
    expect(placementStatusFromFinalConfig({ hosts: [] })).toBe("no_placement_key");
  });

  it("unavailable for empty object", () => {
    expect(placementStatusFromFinalConfig({})).toBe("unavailable");
  });
});
