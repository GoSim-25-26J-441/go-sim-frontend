// Simulation API client for backend integration

import { env } from "@/lib/env";
import { authenticatedFetch } from "./http";
import { SimulationRun } from "@/types/simulation";

const BASE_URL = `${env.NEXT_PUBLIC_BACKEND_BASE}/api/v1/simulation`;

// Feature flag: Set to false to use dummy data instead of backend
// This is useful during development or if backend is not available
const USE_BACKEND = process.env.NEXT_PUBLIC_USE_SIMULATION_BACKEND !== "false";

/**
 * Get all simulation runs
 * 
 * Backend endpoint: GET /api/v1/simulation/runs
 * Note: Backend returns only run IDs, so we fetch each run individually
 */
export async function getSimulationRuns(): Promise<SimulationRun[]> {
  try {
    if (USE_BACKEND) {
      const response = await authenticatedFetch(`${BASE_URL}/runs`, {
        method: "GET",
      });
      
      // Handle authentication errors gracefully
      if (response.status === 401) {
        console.warn("User not authenticated. Falling back to dummy data.");
        if (process.env.NODE_ENV === "development") {
          const { generateDummySimulationRuns } = await import("@/lib/simulation/dummy-data");
          return generateDummySimulationRuns();
        }
        // In production, return empty array if not authenticated
        return [];
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch simulation runs" }));
        throw new Error(errorData.error || errorData.message || `Failed to fetch simulation runs: ${response.status}`);
      }
      
      const data = await response.json();
      const runIDs: string[] = data.runs || [];
      
      // Backend returns only IDs, so fetch each run
      const runs = await Promise.all(
        runIDs.map(id => getSimulationRun(id).catch(err => {
          console.error(`Failed to fetch run ${id}:`, err);
          return null;
        }))
      );
      
      // Filter out nulls (failed fetches)
      return runs.filter((run): run is SimulationRun => run !== null);
    }

    // Fallback to dummy data
    const { generateDummySimulationRuns } = await import("@/lib/simulation/dummy-data");
    return generateDummySimulationRuns();
  } catch (error) {
    console.error("Error fetching simulation runs:", error);
    
    // If backend fails and we're using backend, fall back to dummy data in development
    if (USE_BACKEND && process.env.NODE_ENV === "development") {
      console.warn("Backend request failed, falling back to dummy data");
      const { generateDummySimulationRuns } = await import("@/lib/simulation/dummy-data");
      return generateDummySimulationRuns();
    }
    
    throw error;
  }
}

/**
 * Get a single simulation run by ID
 * 
 * Backend endpoint: GET /api/v1/simulation/runs/{id}
 */
export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  try {
    if (USE_BACKEND) {
      const response = await authenticatedFetch(`${BASE_URL}/runs/${id}`, {
        method: "GET",
      });
      
      // Handle authentication errors gracefully
      if (response.status === 401) {
        console.warn("User not authenticated. Falling back to dummy data.");
        if (process.env.NODE_ENV === "development") {
          const { getDummySimulationRun } = await import("@/lib/simulation/dummy-data");
          return getDummySimulationRun(id);
        }
        return null;
      }
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch simulation run" }));
        throw new Error(errorData.error || errorData.message || `Failed to fetch simulation run: ${response.status}`);
      }
      
      const data = await response.json();
      const backendRun = data.run;
      
      // Transform backend format to frontend format
      return transformBackendRunToSimulationRun(backendRun);
    }

    // Fallback to dummy data
    const { getDummySimulationRun } = await import("@/lib/simulation/dummy-data");
    return getDummySimulationRun(id);
  } catch (error) {
    console.error("Error fetching simulation run:", error);
    
    // If backend fails and we're using backend, fall back to dummy data in development
    if (USE_BACKEND && process.env.NODE_ENV === "development") {
      console.warn("Backend request failed, falling back to dummy data");
      const { getDummySimulationRun } = await import("@/lib/simulation/dummy-data");
      return getDummySimulationRun(id);
    }
    
    throw error;
  }
}

/**
 * Create a new simulation run
 * 
 * Backend endpoint: POST /api/v1/simulation/runs
 * Backend only accepts metadata, not the full config
 */
export async function createSimulationRun(
  config: Omit<SimulationRun, "id" | "status" | "created_at" | "started_at" | "completed_at" | "duration_seconds" | "results" | "error">
): Promise<SimulationRun> {
  try {
    if (USE_BACKEND) {
      // Backend only accepts metadata in the request body
      // Store the full config in metadata for now
      const response = await authenticatedFetch(`${BASE_URL}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            name: config.name,
            config: config.config,
          },
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to create simulation" }));
        throw new Error(errorData.error || errorData.message || `Failed to create simulation: ${response.status}`);
      }
      
      const data = await response.json();
      const backendRun = data.run;
      
      // Transform and merge with original config
      const run = transformBackendRunToSimulationRun(backendRun);
      return {
        ...run,
        name: config.name,
        config: config.config,
      };
    }

    // Fallback: simulate API call with dummy data
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
 * 
 * Note: Backend doesn't have a start endpoint - actual simulation execution
 * should be handled by calling simulation-core directly.
 * This function updates the run status in the backend.
 */
export async function startSimulationRun(id: string): Promise<SimulationRun> {
  try {
    if (USE_BACKEND) {
      // Update run status to running
      const response = await authenticatedFetch(`${BASE_URL}/runs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "running",
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to start simulation" }));
        throw new Error(errorData.error || errorData.message || `Failed to start simulation: ${response.status}`);
      }
      
      const data = await response.json();
      return transformBackendRunToSimulationRun(data.run);
    }

    // Fallback: simulate API call
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
 * 
 * Note: Backend doesn't have a stop endpoint - actual simulation cancellation
 * should be handled by calling simulation-core directly.
 * This function updates the run status in the backend.
 */
export async function stopSimulationRun(id: string): Promise<SimulationRun> {
  try {
    if (USE_BACKEND) {
      // Update run status to cancelled
      const response = await authenticatedFetch(`${BASE_URL}/runs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "cancelled",
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to stop simulation" }));
        throw new Error(errorData.error || errorData.message || `Failed to stop simulation: ${response.status}`);
      }
      
      const data = await response.json();
      return transformBackendRunToSimulationRun(data.run);
    }

    // Fallback: simulate API call
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
 * 
 * Note: This should call simulation-core directly, not the backend API
 * The backend only manages run metadata, not simulation execution
 * 
 * TODO: Implement direct call to simulation-core /v1/runs/{engine_run_id}/workload
 * For now, we need to fetch the run first to get the engine_run_id
 */
export async function updateWorkloadRate(
  runId: string,
  patternKey: string,
  rateRps: number
): Promise<{ message: string; run_id: string; pattern_key: string }> {
  try {
    // First, get the run to find the engine_run_id
    const run = await getSimulationRun(runId);
    if (!run) {
      throw new Error("Simulation run not found");
    }

    // Get engine_run_id from the run's metadata
    // The backend stores engine_run_id separately, so we need to fetch the raw backend response
    // For now, log a warning that this needs simulation-core integration
    console.warn(`[TODO] Update workload rate via simulation-core. Need engine_run_id for run ${runId}`);
    console.log(`[Simulated] Updating workload rate: ${patternKey} = ${rateRps} RPS`);
    
    // TODO: Call simulation-core directly:
    // const engineRunId = ...; // Get from backend run
    // const simCoreUrl = process.env.NEXT_PUBLIC_SIMULATION_CORE_URL || "http://localhost:8080";
    // await fetch(`${simCoreUrl}/v1/runs/${engineRunId}/workload`, {
    //   method: "PATCH",
    //   body: JSON.stringify({ pattern_key: patternKey, rate_rps: rateRps }),
    // });
    
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
 * Note: For real-time streaming metrics, use the SimulationStream class from './simulation-stream'
 * This endpoint returns the current snapshot of metrics
 * 
 * Backend endpoint: GET /api/v1/simulation/runs/{id}/metrics (if available)
 * For streaming, use: GET /api/v1/simulation/runs/{id}/stream
 */
export async function getSimulationMetrics(id: string): Promise<SimulationRun["results"] | null> {
  try {
    // Most backends will include metrics in the run object itself
    // This separate endpoint may not exist, but we check for it first
    if (USE_BACKEND) {
      try {
        const response = await authenticatedFetch(`${BASE_URL}/runs/${id}/metrics`, {
          method: "GET",
        });
        
        if (response.ok) {
          const data = await response.json();
          return data.results as SimulationRun["results"];
        }
        // If endpoint doesn't exist (404), fall through to getting from run
      } catch (e) {
        // If request fails, fall through to getting from run
      }
    }

    // Fallback: get metrics from the run object
    const run = await getSimulationRun(id);
    return run?.results || null;
  } catch (error) {
    console.error("Error fetching simulation metrics:", error);
    return null;
  }
}

/**
 * Transform backend run format to frontend SimulationRun format
 */
function transformBackendRunToSimulationRun(backendRun: any): SimulationRun {
  // Extract metadata
  const metadata = backendRun.metadata || {};
  const config = metadata.config || {
    nodes: 0,
    workload: {
      concurrent_users: 0,
      duration_seconds: 0,
    },
    resources: {
      vcpu_per_node: 0,
      memory_gb_per_node: 0,
    },
  };

  return {
    id: backendRun.run_id,
    name: metadata.name || `Run ${backendRun.run_id}`,
    status: backendRun.status as SimulationRun["status"],
    created_at: new Date(backendRun.created_at).toISOString(),
    started_at: backendRun.updated_at && backendRun.status !== "pending" 
      ? new Date(backendRun.updated_at).toISOString() 
      : undefined,
    completed_at: backendRun.completed_at 
      ? new Date(backendRun.completed_at).toISOString() 
      : undefined,
    duration_seconds: backendRun.completed_at && backendRun.created_at
      ? Math.floor((new Date(backendRun.completed_at).getTime() - new Date(backendRun.created_at).getTime()) / 1000)
      : undefined,
    config,
    results: metadata.results || undefined,
    error: backendRun.status === "failed" ? metadata.error || "Simulation failed" : undefined,
    // Store engine_run_id in metadata for reference
    engine_run_id: backendRun.engine_run_id,
  } as SimulationRun & { engine_run_id?: string };
}

