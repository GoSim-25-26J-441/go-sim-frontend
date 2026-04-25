// Simulation API client for backend integration
// Backend: go-sim-backend simulation API (source of truth for create/start/stop/events)

import { env } from "@/lib/env";
import { authenticatedFetch } from "./http";
import { SimulationRun } from "@/types/simulation";
import { SimulationApiError, type SimulationErrorBody } from "./simulation-errors";

const BASE_URL = `${env.BACKEND_BASE}/api/v1/simulation`;

export { SimulationApiError, isSimulationApiError } from "./simulation-errors";
export type {
  ScenarioValidationIssue,
  ScenarioValidationResult,
} from "./scenario-validation";
export { validateScenarioYaml } from "./scenario-validation";

// --- Backend create run (project-level) ---

/**
 * Optimization JSON forwarded to simulation-core (passthrough).
 * Known fields are typed; extra engine/proto keys are allowed via index signature.
 *
 * Offline hill-climbing: use objective, max_iterations, step_size, etc. — leave `batch` empty/absent.
 * Batch beam search: set `batch` to a non-empty object and `online: false` (do not combine with online: true).
 */
export interface CreateProjectRunOptimization {
  objective?:
    | "recommended_config"
    | "p95_latency_ms"
    | "p99_latency_ms"
    | "mean_latency_ms"
    | "throughput_rps"
    | "error_rate"
    | "cost"
    | "cpu_utilization"
    | "memory_utilization";
  max_iterations?: number;
  /** Cap total evaluations to avoid too many runs; e.g. 25 */
  max_evaluations?: number;
  step_size?: number;
  evaluation_duration_ms?: number;
  online?: boolean;
  /** Beam / batch search nested config (enable_local_refinement, beam width, etc.) */
  batch?: Record<string, unknown>;
  target_p95_latency_ms?: number;
  control_interval_ms?: number;
  min_hosts?: number;
  max_hosts?: number;
  /** Primary signal for scaling; default "p95_latency" if omitted */
  optimization_target_primary?: "p95_latency" | "cpu_utilization" | "memory_utilization";
  /** 0–1; used when primary is CPU or memory; default 0.7 */
  target_util_high?: number;
  /** 0–1; used when primary is CPU or memory; default 0.4 */
  target_util_low?: number;
  /** 0–1; 0 = not used */
  scale_down_cpu_util_max?: number;
  /** 0–1; 0 = not used */
  scale_down_mem_util_max?: number;
  /** 0–1; 0 = host scale-in disabled */
  scale_down_host_cpu_util_max?: number;
  max_controller_steps?: number;
  max_online_duration_ms?: number;
  allow_unbounded_online?: boolean;
  max_noop_intervals?: number;
  lease_ttl_ms?: number;
  scale_down_cooldown_ms?: number;
  host_drain_timeout_ms?: number;
  memory_headroom_mb?: number;
  [key: string]: unknown;
}

/**
 * Create run: sample flow sends `scenario_yaml`. Diagram versions use `diagram_version_id`
 * with optional `scenario_yaml` + `save_scenario` / `overwrite_scenario_cache` per backend contract.
 */
export interface CreateProjectRunRequest {
  scenario_yaml?: string;
  diagram_version_id?: string;
  /** Persist editor YAML as the reusable diagram scenario when starting the run. */
  save_scenario?: boolean;
  overwrite_scenario_cache?: boolean;
  duration_ms: number;
  real_time_mode?: boolean;
  config_yaml?: string;
  seed?: number;
  optimization?: CreateProjectRunOptimization;
  metadata?: Record<string, unknown>;
}

// --- Diagram version scenario draft (backend-owned AMG/APD → simulation YAML) ---

/** GET/PUT diagram scenario — backend may add status fields; we pass through common names. */
export interface DiagramScenarioDraftResponse {
  scenario_yaml: string;
  /** e.g. generated | edited | cached */
  status?: string;
  draft_status?: string;
  source?: string;
  [key: string]: unknown;
}

export async function getDiagramScenarioDraft(
  projectId: string,
  diagramVersionId: string
): Promise<DiagramScenarioDraftResponse> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/diagram-versions/${encodeURIComponent(diagramVersionId)}/scenario`;
  const response = await authenticatedFetch(url, { method: "GET" });
  if (!response.ok) {
    await throwSimulationHttpError(response, "Load scenario draft failed");
  }
  return response.json() as Promise<DiagramScenarioDraftResponse>;
}

export async function putDiagramScenarioDraft(
  projectId: string,
  diagramVersionId: string,
  body: { scenario_yaml: string; overwrite: boolean }
): Promise<DiagramScenarioDraftResponse | void> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/diagram-versions/${encodeURIComponent(diagramVersionId)}/scenario`;
  const response = await authenticatedFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwSimulationHttpError(response, "Save scenario failed");
  }
  const text = await response.text();
  if (!text.trim()) return;
  try {
    return JSON.parse(text) as DiagramScenarioDraftResponse;
  } catch {
    return;
  }
}

export async function regenerateDiagramScenario(
  projectId: string,
  diagramVersionId: string,
  body: { overwrite: boolean }
): Promise<DiagramScenarioDraftResponse | void> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/diagram-versions/${encodeURIComponent(diagramVersionId)}/scenario/regenerate`;
  const response = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwSimulationHttpError(response, "Regenerate scenario failed");
  }
  const text = await response.text();
  if (!text.trim()) return;
  try {
    return JSON.parse(text) as DiagramScenarioDraftResponse;
  } catch {
    return;
  }
}

export interface CreateProjectRunResponseRun {
  run_id: string;
  engine_run_id?: string;
  status: string;
  user_id?: string;
  project_id?: string;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProjectRunResponse {
  run: CreateProjectRunResponseRun;
}

// --- Realtime config (online mode) ---

export interface PatchRunConfigurationService {
  id: string;
  replicas: number;
  cpu_cores?: number;
  memory_mb?: number;
}

export interface PatchRunConfigurationWorkloadItem {
  pattern_key: string;
  rate_rps: number;
}

export interface PatchRunConfigurationPolicies {
  autoscaling?: {
    enabled: boolean;
    target_cpu_util?: number;
    scale_step?: number;
  };
}

/** At least one of services, workload, or policies must be sent. */
export interface PatchRunConfigurationBody {
  /** Per-service vertical scale; cpu_cores / memory_mb: 0 = leave unchanged (engine contract). */
  services?: PatchRunConfigurationService[];
  workload?: PatchRunConfigurationWorkloadItem[];
  policies?: PatchRunConfigurationPolicies;
}

export interface PatchRunConfigurationResponse {
  message: string;
  run_id: string;
}

export interface PatchRunWorkloadBody {
  pattern_key: string;
  rate_rps: number;
}

/**
 * Full configuration update for a running simulation (online mode).
 * Backend: PATCH /api/v1/simulation/runs/:id/configuration
 */
export async function patchRunConfiguration(
  runId: string,
  body: PatchRunConfigurationBody
): Promise<PatchRunConfigurationResponse> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(runId)}/configuration`;
  const response = await authenticatedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Configuration update failed" }));
    throw new Error((err as { error?: string }).error ?? `Configuration update failed (${response.status})`);
  }
  return response.json() as Promise<PatchRunConfigurationResponse>;
}

/**
 * Workload-only update for a running simulation (online mode).
 * Backend: PATCH /api/v1/simulation/runs/:id/workload
 */
export async function patchRunWorkload(
  runId: string,
  body: PatchRunWorkloadBody
): Promise<{ message: string; run_id?: string }> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(runId)}/workload`;
  const response = await authenticatedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Workload update failed" }));
    throw new Error((err as { error?: string }).error ?? `Workload update failed (${response.status})`);
  }
  return response.json() as Promise<{ message: string; run_id?: string }>;
}

/**
 * Get all simulation runs
 * TODO: Replace with actual backend call when endpoint is available
 */
export async function getSimulationRuns(): Promise<SimulationRun[]> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs`, {
    //   method: "GET",
    // });
    // if (!response.ok) {
    //   throw new Error("Failed to fetch simulation runs");
    // }
    // const data = await response.json();
    // return data.runs as SimulationRun[];

    // For now, use dummy data
    const { generateDummySimulationRuns } = await import("@/lib/simulation/dummy-data");
    return generateDummySimulationRuns();
  } catch (error) {
    console.error("Error fetching simulation runs:", error);
    throw error;
  }
}

/**
 * Get a single simulation run by ID
 * TODO: Replace with actual backend call when endpoint is available
 */
export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs/${id}`, {
    //   method: "GET",
    // });
    // if (!response.ok) {
    //   if (response.status === 404) return null;
    //   throw new Error("Failed to fetch simulation run");
    // }
    // const data = await response.json();
    // return data.run as SimulationRun;

    // For now, use dummy data
    const { getDummySimulationRun } = await import("@/lib/simulation/dummy-data");
    return getDummySimulationRun(id);
  } catch (error) {
    console.error("Error fetching simulation run:", error);
    throw error;
  }
}

/**
 * Create a new simulation run (project-level).
 * Backend: POST /api/v1/simulation/projects/:project_id/runs
 * Use returned run.run_id for start, SSE, stop, candidates (includes best-candidate).
 */
async function throwSimulationHttpError(
  response: Response,
  fallback: string
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as SimulationErrorBody;
  const msg =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : `${fallback} (${response.status})`;
  throw new SimulationApiError(msg, response.status, body);
}

/**
 * Renew the online optimization lease before `lease_ttl_ms` expires (long online runs).
 * Backend: POST /api/v1/simulation/runs/:id/online/renew-lease
 */
export async function renewOnlineLease(runId: string): Promise<{ ok?: boolean; message?: string }> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(runId)}/online/renew-lease`;
  const response = await authenticatedFetch(url, {
    method: "POST",
  });
  if (!response.ok) {
    await throwSimulationHttpError(response, "Lease renewal failed");
  }
  return response.json().catch(() => ({})) as Promise<{ ok?: boolean; message?: string }>;
}

export async function createProjectSimulationRun(
  projectId: string,
  body: CreateProjectRunRequest
): Promise<CreateProjectRunResponse> {
  const url = `${BASE_URL}/projects/${encodeURIComponent(projectId)}/runs`;
  const response = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwSimulationHttpError(response, "Create run failed");
  }
  const data = (await response.json()) as CreateProjectRunResponse;
  return data;
}


/**
 * Create a new simulation run (legacy shape; prefer createProjectSimulationRun for new flows)
 */
export async function createSimulationRun(
  config: Omit<SimulationRun, "id" | "status" | "created_at" | "started_at" | "completed_at" | "duration_seconds" | "results" | "error">
): Promise<SimulationRun> {
  try {
    const newRun: SimulationRun = {
      id: `sim-run-${Date.now()}`,
      status: "pending",
      created_at: new Date().toISOString(),
      ...config,
    };
    return newRun;
  } catch (error) {
    console.error("Error creating simulation run:", error);
    throw error;
  }
}

/**
 * Start a simulation run.
 * Backend: PUT /api/v1/simulation/runs/:id with body { status: "running" }
 */
export async function startSimulationRun(id: string): Promise<{ run_id: string; status: string }> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(id)}`;
  const response = await authenticatedFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "running" }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed to start simulation run" }));
    throw new Error((err as { error?: string }).error ?? `Start run failed (${response.status})`);
  }
  const data = (await response.json()) as { run?: { run_id: string; status: string } };
  const run = data.run;
  if (run) return { run_id: run.run_id, status: run.status };
  return { run_id: id, status: "running" };
}

/**
 * Stop a running simulation.
 * Backend: PUT /api/v1/simulation/runs/:id
 *
 * mode "completed" (default) – normal stop, e.g. user clicks "Stop" on an
 *   online run. Engine is halted and the run is stored as completed.
 * mode "cancelled" – abort/cancel. Engine is halted and run stored as cancelled.
 */
/**
 * Terminal modes accepted by the backend:
 *   "stopped"   – explicit stop, aligned with RUN_STATUS_STOPPED from engine (default)
 *   "completed" – end an online run and treat it as successfully completed
 *   "cancelled" – abort / user cancel
 */
export async function stopSimulationRun(
  id: string,
  mode: "stopped" | "completed" | "cancelled" = "stopped",
): Promise<{ run_id: string; status: string }> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(id)}`;
  const response = await authenticatedFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: mode }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed to stop simulation run" }));
    throw new Error((err as { error?: string }).error ?? `Stop run failed (${response.status})`);
  }
  const data = (await response.json()) as { run?: { run_id: string; status: string } };
  const run = data.run;
  if (run) return { run_id: run.run_id, status: run.status };
  return { run_id: id, status: mode };
}

/**
 * Update run (PUT /runs/:id). Used for run control: status (e.g. "completed", "cancelled")
 * or metadata. Backend: PUT /api/v1/simulation/runs/:id
 */
export interface UpdateRunBody {
  status?: "running" | "completed" | "cancelled" | "stopped" | string;
  metadata?: Record<string, unknown>;
  engine_run_id?: string;
}

export async function updateRun(
  id: string,
  body: UpdateRunBody
): Promise<{ run_id: string; status: string; run?: { run_id: string; status: string; metadata?: Record<string, unknown> } }> {
  const url = `${BASE_URL}/runs/${encodeURIComponent(id)}`;
  const response = await authenticatedFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Run update failed" }));
    throw new Error((err as { error?: string }).error ?? `Run update failed (${response.status})`);
  }
  const data = (await response.json()) as { run?: { run_id: string; status: string; metadata?: Record<string, unknown> } };
  const run = data.run;
  if (run) return { run_id: run.run_id, status: run.status, run };
  return { run_id: id, status: body.status ?? "unknown", run: data.run };
}

/**
 * Update workload rate for a running simulation (online mode).
 * Thin wrapper around patchRunWorkload.
 */
export async function updateWorkloadRate(
  runId: string,
  patternKey: string,
  rateRps: number
): Promise<{ message: string; run_id: string; pattern_key: string }> {
  const res = await patchRunWorkload(runId, { pattern_key: patternKey, rate_rps: rateRps });
  return {
    message: res.message,
    run_id: res.run_id ?? runId,
    pattern_key: patternKey,
  };
}

// --- Persisted run metrics (GET /runs/:id/metrics and /metrics/timeseries) ---

/** Label values may be strings or coerced primitives from the backend. */
export type PersistedMetricLabelValue = string | number | boolean;

/** Nested series point: use `time` for the timestamp field. */
export interface SimulationRunMetricsNestedPoint {
  time: string;
  value: number;
  labels?: Record<string, PersistedMetricLabelValue | undefined>;
  tags?: Record<string, unknown>;
  service_id?: string;
  host_id?: string;
  instance_id?: string;
  node_id?: string;
}

export interface SimulationRunMetricsNestedTimeseries {
  metric: string;
  points: SimulationRunMetricsNestedPoint[];
}

/** GET /api/v1/simulation/runs/:id/metrics */
export interface SimulationRunMetricsResponse {
  run_id: string;
  summary?: SimulationRunMetricsSummary;
  timeseries?: SimulationRunMetricsNestedTimeseries[];
}

/** Persisted metrics summary; `final_config` is backend-owned placement/topology (optional on older runs). */
export interface SimulationRunMetricsSummary extends Record<string, unknown> {
  final_config?: Record<string, unknown>;
}

/** Flat point: use `timestamp` (or `time` on some legacy payloads). When `?metric=` is omitted, each point may include `metric`. */
export interface SimulationRunMetricsFlatPoint {
  metric?: string;
  timestamp?: string;
  /** Some nested-style points may appear on flat responses during rollout */
  time?: string;
  value: number;
  labels?: Record<string, PersistedMetricLabelValue | undefined>;
  tags?: Record<string, unknown>;
  service_id?: string;
  host_id?: string;
  instance_id?: string;
  node_id?: string;
}

/** GET /api/v1/simulation/runs/:id/metrics/timeseries */
export interface SimulationRunMetricsFlatResponse {
  run_id: string;
  points: SimulationRunMetricsFlatPoint[];
}

/**
 * Get real-time metrics for a running simulation
 * TODO: Replace with WebSocket or SSE when backend is ready
 */
export {
  normalizePersistedMetricPoint,
  type NormalizedPersistedMetricPoint,
} from "@/lib/simulation/normalize-persisted-metric-point";

export async function getSimulationMetrics(id: string): Promise<SimulationRun["results"] | null> {
  try {
    // When backend is ready, this could use WebSocket or SSE:
    // const response = await authenticatedFetch(`${BASE_URL}/runs/${id}/metrics`, {
    //   method: "GET",
    // });
    // if (!response.ok) return null;
    // const data = await response.json();
    // return data.results as SimulationRun["results"];

    // For now, use dummy data
    const run = await getSimulationRun(id);
    return run?.results || null;
  } catch (error) {
    console.error("Error fetching simulation metrics:", error);
    return null;
  }
}

