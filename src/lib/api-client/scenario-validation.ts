import { authenticatedFetch } from "./http";

export interface ScenarioValidationIssue {
  code?: string;
  message: string;
  service_id?: string;
  field?: string;
}

export interface ScenarioValidationResult {
  valid: boolean;
  errors: ScenarioValidationIssue[];
  warnings: ScenarioValidationIssue[];
  summary?: {
    hosts?: number;
    services?: number;
    workloads?: number;
  };
}

/**
 * Validate scenario YAML without creating a run.
 * Backend: POST /v1/scenarios:validate
 */
export async function validateScenarioYaml(scenarioYaml: string): Promise<ScenarioValidationResult> {
  let response: Response;
  try {
    response = await authenticatedFetch("/v1/scenarios:validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_yaml: scenarioYaml }),
    });
  } catch {
    throw new Error("Could not validate scenario. Check simulation-core connection.");
  }

  const payload = (await response.json().catch(() => null)) as
    | Partial<ScenarioValidationResult>
    | null;

  if (!payload || typeof payload !== "object") {
    throw new Error(`Scenario validation failed (${response.status}).`);
  }

  const result: ScenarioValidationResult = {
    valid: Boolean(payload.valid),
    errors: Array.isArray(payload.errors) ? (payload.errors as ScenarioValidationIssue[]) : [],
    warnings: Array.isArray(payload.warnings) ? (payload.warnings as ScenarioValidationIssue[]) : [],
    summary: payload.summary,
  };

  if (!response.ok && !(response.status === 400 && result.valid === false)) {
    throw new Error("Could not validate scenario. Check simulation-core connection.");
  }

  return result;
}
