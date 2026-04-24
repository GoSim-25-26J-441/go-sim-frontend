import { SAMPLE_BASIC_YAML } from "./sample-scenario-basic-yaml";
import { SAMPLE_SCENARIO_V2_YAML } from "./sample-scenario-v2-yaml";

/** Legacy URL/query value; maps to {@link SAMPLE_IDS.basic}. */
export const LEGACY_SAMPLE_URL_VERSION = "sample" as const;

export const SAMPLE_IDS = {
  basic: "sample-basic",
  scenarioV2: "sample-scenario-v2",
} as const;

export type SampleScenarioId = (typeof SAMPLE_IDS)[keyof typeof SAMPLE_IDS];

/** Map `?version=sample` to the basic bundled sample. */
export function normalizeSampleVersionFromUrlParam(version: string | null): string | null {
  if (version === null || version === "") return null;
  if (version === LEGACY_SAMPLE_URL_VERSION) return SAMPLE_IDS.basic;
  return version;
}

export function isSampleScenarioId(id: string | null | undefined): boolean {
  if (id == null) return false;
  return id === SAMPLE_IDS.basic || id === SAMPLE_IDS.scenarioV2;
}

export function getSampleScenarioYaml(id: string): string | null {
  if (id === SAMPLE_IDS.basic) return SAMPLE_BASIC_YAML;
  if (id === SAMPLE_IDS.scenarioV2) return SAMPLE_SCENARIO_V2_YAML;
  return null;
}

export interface SampleScenarioDropdownOption {
  id: string;
  label: string;
  description?: string;
}

export const SAMPLE_SCENARIO_DROPDOWN_OPTIONS: SampleScenarioDropdownOption[] = [
  {
    id: SAMPLE_IDS.basic,
    label: "Sample (basic)",
    description: "Small users/login workload for quick starts.",
  },
  {
    id: SAMPLE_IDS.scenarioV2,
    label: "ScenarioV2 (full)",
    description: "Schema 0.2.0 topology from simulation-core (metadata, zones, queues, topics, policies).",
  },
];
