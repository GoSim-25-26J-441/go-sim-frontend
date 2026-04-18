import { describe, expect, it } from "vitest";
import {
  getSampleScenarioYaml,
  isSampleScenarioId,
  LEGACY_SAMPLE_URL_VERSION,
  normalizeSampleVersionFromUrlParam,
  SAMPLE_IDS,
  SAMPLE_SCENARIO_DROPDOWN_OPTIONS,
} from "./sample-scenarios";

describe("sample-scenarios registry", () => {
  it("maps legacy ?version=sample to sample-basic", () => {
    expect(normalizeSampleVersionFromUrlParam(LEGACY_SAMPLE_URL_VERSION)).toBe(SAMPLE_IDS.basic);
  });

  it("exposes stable ids and dropdown labels for bundled samples", () => {
    expect(SAMPLE_IDS.basic).toBe("sample-basic");
    expect(SAMPLE_IDS.scenarioV2).toBe("sample-scenario-v2");
    const byId = Object.fromEntries(SAMPLE_SCENARIO_DROPDOWN_OPTIONS.map((o) => [o.id, o.label]));
    expect(byId[SAMPLE_IDS.basic]).toBe("Sample (basic)");
    expect(byId[SAMPLE_IDS.scenarioV2]).toBe("ScenarioV2 (full)");
  });

  it("recognizes sample ids and returns bundled YAML", () => {
    expect(isSampleScenarioId(SAMPLE_IDS.basic)).toBe(true);
    expect(isSampleScenarioId(SAMPLE_IDS.scenarioV2)).toBe(true);
    expect(isSampleScenarioId("diagram-version-uuid")).toBe(false);
    expect(getSampleScenarioYaml(SAMPLE_IDS.basic)?.length).toBeGreaterThan(50);
    expect(getSampleScenarioYaml(SAMPLE_IDS.scenarioV2)?.length).toBeGreaterThan(500);
    expect(getSampleScenarioYaml("other")).toBeNull();
  });
});
