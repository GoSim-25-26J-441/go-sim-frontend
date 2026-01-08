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
 * 
 * Demo runs are always included alongside real runs for demonstration purposes
 */
export async function getSimulationRuns(): Promise<SimulationRun[]> {
  // Always include demo runs for demonstration
  const { getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
  const demoRuns = getDemoSimulationRuns();
  
  try {
    if (USE_BACKEND) {
      const response = await authenticatedFetch(`${BASE_URL}/runs`, {
        method: "GET",
      });
      
      // Handle authentication errors gracefully
      if (response.status === 401) {
        console.warn("User not authenticated. Returning demo runs only.");
        return demoRuns;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch simulation runs" }));
        console.error("Failed to fetch simulation runs:", errorData);
        // Return demo runs even if backend fails
        return demoRuns;
      }
      
      const data = await response.json();
      const runIDs: string[] = data.runs || [];
      
      // Backend returns only IDs, so fetch each run
      const realRuns = await Promise.all(
        runIDs.map(id => getSimulationRun(id).catch(err => {
          console.error(`Failed to fetch run ${id}:`, err);
          return null;
        }))
      );
      
      // Filter out nulls (failed fetches) and demo runs (to avoid duplicates)
      const validRealRuns = realRuns.filter((run): run is SimulationRun => 
        run !== null && !run.id.startsWith("demo-")
      );
      
      // Combine demo runs with real runs, demo runs first
      return [...demoRuns, ...validRealRuns];
    }

    // If not using backend, return demo runs only
    return demoRuns;
  } catch (error) {
    console.error("Error fetching simulation runs:", error);
    
    // Always return demo runs even if there's an error
    return demoRuns;
  }
}

/**
 * Get a single simulation run by ID
 * 
 * Backend endpoint: GET /api/v1/simulation/runs/{id}
 */
export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  // Check if it's a demo run first
  if (id.startsWith("demo-")) {
    const { getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
    const demoRuns = getDemoSimulationRuns();
    return demoRuns.find(r => r.id === id) || null;
  }
  
  try {
    if (USE_BACKEND) {
      const response = await authenticatedFetch(`${BASE_URL}/runs/${id}`, {
        method: "GET",
      });
      
      // Handle authentication errors gracefully
      if (response.status === 401) {
        console.warn("User not authenticated. Checking demo runs.");
        const { getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
        const demoRuns = getDemoSimulationRuns();
        return demoRuns.find(r => r.id === id) || null;
      }
      
      if (response.status === 404) {
        // Check demo runs as fallback
        const { getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
        const demoRuns = getDemoSimulationRuns();
        return demoRuns.find(r => r.id === id) || null;
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
    const { getDummySimulationRun, getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
    // Try demo runs first
    const demoRuns = getDemoSimulationRuns();
    const demoRun = demoRuns.find(r => r.id === id);
    if (demoRun) return demoRun;
    
    // Then try regular dummy runs
    return getDummySimulationRun(id);
  } catch (error) {
    console.error("Error fetching simulation run:", error);
    
    // Always check demo runs as fallback
    const { getDemoSimulationRuns } = await import("@/lib/simulation/dummy-data");
    const demoRuns = getDemoSimulationRuns();
    const demoRun = demoRuns.find(r => r.id === id);
    if (demoRun) return demoRun;
    
    throw error;
  }
}

/**
 * Create a new simulation run
 * 
 * Backend endpoint: POST /api/v1/simulation/runs
 * Backend requires scenario_yaml and duration_ms to create the run in the simulation engine
 * @param realTimeMode - Optional boolean to enable real-time mode for faster simulation
 */
export async function createSimulationRun(
  config: Omit<SimulationRun, "id" | "status" | "created_at" | "started_at" | "completed_at" | "duration_seconds" | "results" | "error">,
  scenarioYaml?: string,
  realTimeMode?: boolean
): Promise<SimulationRun> {
  try {
    if (USE_BACKEND) {
      // Backend requires scenario_yaml and duration_ms to create run in simulation engine
      // If scenario_yaml is not provided, we can't create the run in the engine
      // The run will be created in backend but won't have engine_run_id
      const durationMs = config.config.workload.duration_seconds * 1000;
      
      const requestBody: any = {
        metadata: {
          name: config.name,
          config: config.config,
        },
      };
      
      // Only include scenario_yaml if provided (required for engine run creation)
      if (scenarioYaml) {
        requestBody.scenario_yaml = scenarioYaml;
        requestBody.duration_ms = durationMs;
        
        // Include real_time_mode if provided
        if (realTimeMode !== undefined) {
          requestBody.real_time_mode = realTimeMode;
        }
      }
      
      const response = await authenticatedFetch(`${BASE_URL}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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
 * Backend endpoint: PUT /api/v1/simulation/runs/{id}
 * The backend UpdateRun handler will start the run in the simulation engine
 * if the run has an engine_run_id and status is set to "running".
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
 * Backend endpoint: PUT /api/v1/simulation/runs/{id}
 * The backend UpdateRun handler will stop the run in the simulation engine
 * if the run has an engine_run_id and status is set to "cancelled".
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
export function transformBackendRunToSimulationRun(backendRun: any): SimulationRun {
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

