// Simulation API client for backend integration
// Currently uses dummy data, but structured for easy backend integration

import { env } from "@/lib/env";
import { authenticatedFetch } from "./http";
import { SimulationRun } from "@/types/simulation";

const BASE_URL = `${env.BACKEND_BASE}/api/v1/simulation`;

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
 * Create a new simulation run
 * TODO: Replace with actual backend call when endpoint is available
 */
export async function createSimulationRun(
  config: Omit<SimulationRun, "id" | "status" | "created_at" | "started_at" | "completed_at" | "duration_seconds" | "results" | "error">
): Promise<SimulationRun> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(config),
    // });
    // if (!response.ok) {
    //   const error = await response.json().catch(() => ({ error: "Failed to create simulation" }));
    //   throw new Error(error.error || "Failed to create simulation");
    // }
    // const data = await response.json();
    // return data.run as SimulationRun;

    // For now, simulate API call
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
 * Start a simulation run
 * TODO: Replace with actual backend call when endpoint is available
 */
export async function startSimulationRun(id: string): Promise<SimulationRun> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs/${id}/start`, {
    //   method: "POST",
    // });
    // if (!response.ok) {
    //   throw new Error("Failed to start simulation");
    // }
    // const data = await response.json();
    // return data.run as SimulationRun;

    // For now, simulate API call
    const run = await getSimulationRun(id);
    if (!run) throw new Error("Simulation run not found");
    
    return {
      ...run,
      status: "running",
      started_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error starting simulation run:", error);
    throw error;
  }
}

/**
 * Stop a running simulation
 * TODO: Replace with actual backend call when endpoint is available
 */
export async function stopSimulationRun(id: string): Promise<SimulationRun> {
  try {
    // When backend is ready, uncomment this:
    // const response = await authenticatedFetch(`${BASE_URL}/runs/${id}/stop`, {
    //   method: "POST",
    // });
    // if (!response.ok) {
    //   throw new Error("Failed to stop simulation");
    // }
    // const data = await response.json();
    // return data.run as SimulationRun;

    // For now, simulate API call
    const run = await getSimulationRun(id);
    if (!run) throw new Error("Simulation run not found");
    
    return {
      ...run,
      status: "cancelled",
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error stopping simulation run:", error);
    throw error;
  }
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

