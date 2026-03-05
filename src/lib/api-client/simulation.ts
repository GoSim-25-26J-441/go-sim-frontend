// Simulation API client for backend integration
// Backend: go-sim-backend simulation API (source of truth for create/start/stop/events)

import { env } from "@/lib/env";
import { authenticatedFetch } from "./http";
import { SimulationRun } from "@/types/simulation";

const BASE_URL = `${env.BACKEND_BASE}/api/v1/simulation`;

// --- Backend create run (project-level) ---

export interface CreateProjectRunOptimization {
  objective?: "p95_latency_ms" | "p99_latency_ms" | "mean_latency_ms" | "throughput_rps" | "error_rate" | "cost";
  max_iterations?: number;
  step_size?: number;
  evaluation_duration_ms?: number;
  online?: boolean;
  target_p95_latency_ms?: number;
  control_interval_ms?: number;
  min_hosts?: number;
  max_hosts?: number;
}

export interface CreateProjectRunRequest {
  scenario_yaml: string;
  duration_ms: number;
  real_time_mode?: boolean;
  config_yaml?: string;
  seed?: number;
  optimization?: CreateProjectRunOptimization;
  metadata?: Record<string, unknown>;
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
 * Use returned run.run_id for start, SSE, stop, best-candidate.
 */
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
    const err = await response.json().catch(() => ({ error: "Failed to create simulation run" }));
    throw new Error((err as { error?: string }).error ?? `Create run failed (${response.status})`);
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
 * Update workload rate for a running simulation
 * Updates the request rate (RPS) for a specific workload pattern
 */
export async function updateWorkloadRate(
  runId: string,
  patternKey: string,
  rateRps: number
): Promise<{ message: string; run_id: string; pattern_key: string }> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs/${runId}/workload`, {
    //   method: "PATCH",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     pattern_key: patternKey,
    //     rate_rps: rateRps,
    //   }),
    // });
    // if (!response.ok) {
    //   const error = await response.json().catch(() => ({ error: "Failed to update workload rate" }));
    //   throw new Error(error.error || "Failed to update workload rate");
    // }
    // const data = await response.json();
    // return data;

    // For now, simulate API call (log for debugging)
    console.log(`[Simulated] Updating workload rate for ${runId}: ${patternKey} = ${rateRps} RPS`);
    return {
      message: "workload updated successfully",
      run_id: runId,
      pattern_key: patternKey,
    };
  } catch (error) {
    console.error("Error updating workload rate:", error);
    throw error;
  }
}

/**
 * Get real-time metrics for a running simulation
 * TODO: Replace with WebSocket or SSE when backend is ready
 */
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

