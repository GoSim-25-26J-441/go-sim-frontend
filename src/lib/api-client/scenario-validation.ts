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
 * Backend: POST /api/v1/simulation/projects/:project_id/diagram-versions/:diagram_version_id/scenario/validate
 */
export async function validateScenarioYaml(
  projectId: string,
  diagramVersionId: string,
  scenarioYaml: string
): Promise<ScenarioValidationResult> {
  let response: Response;
  try {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedDiagramVersionId = encodeURIComponent(diagramVersionId);
    response = await authenticatedFetch(
      `/api/v1/simulation/projects/${encodedProjectId}/diagram-versions/${encodedDiagramVersionId}/scenario/validate`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_yaml: scenarioYaml }),
      }
    );
  } catch {
    throw new Error("Could not validate scenario.");
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!payload || typeof payload !== "object") {
    throw new Error(`Scenario validation failed (${response.status}).`);
  }

  const maybeNested = payload.validation;
  const validationPayload =
    maybeNested && typeof maybeNested === "object"
      ? (maybeNested as Partial<ScenarioValidationResult>)
      : (payload as Partial<ScenarioValidationResult>);

  const result: ScenarioValidationResult = {
    valid: Boolean(validationPayload.valid),
    errors: Array.isArray(validationPayload.errors) ? (validationPayload.errors as ScenarioValidationIssue[]) : [],
    warnings: Array.isArray(validationPayload.warnings) ? (validationPayload.warnings as ScenarioValidationIssue[]) : [],
    summary: validationPayload.summary,
  };

  if (!response.ok && !(response.status === 400 && result.valid === false)) {
    const backendError = typeof payload.error === "string" && payload.error.trim() ? payload.error.trim() : undefined;
    throw new Error(backendError ?? "Could not validate scenario.");
  }

  return result;
}
