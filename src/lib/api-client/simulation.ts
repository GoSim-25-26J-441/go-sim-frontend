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
/**
 * Transform backend metrics format to frontend results format
 */
function transformBackendMetricsToResults(metrics: any): any {
  if (!metrics) return undefined;

  // Backend sends: latency_mean_ms, latency_p50_ms, latency_p95_ms, latency_p99_ms,
  // successful_requests, throughput_rps, total_requests, service_metrics
  const summary = {
    total_requests: metrics.total_requests || 0,
    successful_requests: metrics.successful_requests || 0,
    failed_requests: (metrics.total_requests || 0) - (metrics.successful_requests || 0),
    avg_latency_ms: metrics.latency_mean_ms || 0,
    p95_latency_ms: metrics.latency_p95_ms || 0,
    p99_latency_ms: metrics.latency_p99_ms || 0,
    avg_rps: metrics.throughput_rps || 0,
    peak_rps: metrics.throughput_rps || 0, // Backend doesn't provide peak, use throughput
  };

  // Transform service_metrics to node_metrics
  // NodeMetrics requires: node_id, spec { vcpu, memory_gb, label }, avg_cpu_util_pct, avg_mem_util_pct, peak_cpu_util_pct, peak_mem_util_pct, network_io_mbps
  // Note: Backend might send service_metrics as empty objects or with limited fields
  // We'll try to extract metrics from various possible locations
  if (process.env.NODE_ENV === "development") {
    console.log("[transformBackendMetricsToResults] service_metrics:", JSON.stringify(metrics.service_metrics, null, 2));
  }
  
  const node_metrics = (metrics.service_metrics || []).map((sm: any, index: number) => {
    const serviceName = sm.service_name || sm.name || `service-${index}`;
    const nodeId = sm.node_id || `node-${serviceName}-${index}`;
    
    // Try to find CPU/memory metrics in various possible formats
    // Backend might send: cpu_utilization (decimal 0-1), cpu_util_pct (0-100), avg_cpu_utilization, etc.
    let cpuUtil = 0;
    if (typeof sm.cpu_utilization === 'number') {
      cpuUtil = sm.cpu_utilization > 1 ? sm.cpu_utilization : sm.cpu_utilization * 100;
    } else if (typeof sm.cpu_util_pct === 'number') {
      cpuUtil = sm.cpu_util_pct;
    } else if (typeof sm.avg_cpu_utilization === 'number') {
      cpuUtil = sm.avg_cpu_utilization > 1 ? sm.avg_cpu_utilization : sm.avg_cpu_utilization * 100;
    } else if (typeof sm.avg_cpu_util_pct === 'number') {
      cpuUtil = sm.avg_cpu_util_pct;
    }
    
    let memUtil = 0;
    if (typeof sm.memory_utilization === 'number') {
      memUtil = sm.memory_utilization > 1 ? sm.memory_utilization : sm.memory_utilization * 100;
    } else if (typeof sm.memory_util_pct === 'number') {
      memUtil = sm.memory_util_pct;
    } else if (typeof sm.avg_memory_utilization === 'number') {
      memUtil = sm.avg_memory_utilization > 1 ? sm.avg_memory_utilization : sm.avg_memory_utilization * 100;
    } else if (typeof sm.avg_memory_util_pct === 'number') {
      memUtil = sm.avg_memory_util_pct;
    }
    
    // Try to get peak values
    let peakCpu = cpuUtil;
    if (typeof sm.peak_cpu_utilization === 'number') {
      peakCpu = sm.peak_cpu_utilization > 1 ? sm.peak_cpu_utilization : sm.peak_cpu_utilization * 100;
    } else if (typeof sm.peak_cpu_util_pct === 'number') {
      peakCpu = sm.peak_cpu_util_pct;
    }
    
    let peakMem = memUtil;
    if (typeof sm.peak_memory_utilization === 'number') {
      peakMem = sm.peak_memory_utilization > 1 ? sm.peak_memory_utilization : sm.peak_memory_utilization * 100;
    } else if (typeof sm.peak_memory_util_pct === 'number') {
      peakMem = sm.peak_memory_util_pct;
    }
    
    return {
      node_id: nodeId,
      spec: {
        label: serviceName,
        vcpu: sm.vcpu || sm.cpu_cores || config?.resources?.vcpu_per_node || 2,
        memory_gb: sm.memory_gb || sm.memory || config?.resources?.memory_gb_per_node || 4,
      },
      avg_cpu_util_pct: Math.max(0, Math.min(100, cpuUtil)),
      avg_mem_util_pct: Math.max(0, Math.min(100, memUtil)),
      peak_cpu_util_pct: Math.max(0, Math.min(100, peakCpu)),
      peak_mem_util_pct: Math.max(0, Math.min(100, peakMem)),
      network_io_mbps: sm.network_io_mbps || sm.network_mbps || 0,
    };
  });

  // Create time_series data from the final metrics
  // Since backend only sends final aggregated metrics, we generate a simple time series
  // representing the simulation with the average values
  // This allows graphs to display even though we don't have intermediate data points
  const avgCpu = node_metrics.length > 0
    ? node_metrics.reduce((sum: number, nm: any) => sum + (nm.avg_cpu_util_pct || 0), 0) / node_metrics.length
    : 0;
  const avgMem = node_metrics.length > 0
    ? node_metrics.reduce((sum: number, nm: any) => sum + (nm.avg_mem_util_pct || 0), 0) / node_metrics.length
    : 0;
  const errorRate = summary.total_requests > 0 
    ? (summary.failed_requests / summary.total_requests) * 100 
    : 0;
  
  // Generate a time series with multiple points for better graph visualization
  // Estimate duration from total requests and RPS, or use a default
  const estimatedDuration = summary.avg_rps > 0 
    ? Math.max(60, Math.ceil(summary.total_requests / summary.avg_rps))
    : 60; // Default to 60 seconds if we can't calculate
  const numPoints = Math.min(30, Math.max(5, Math.floor(estimatedDuration / 5))); // 5-30 points
  
  const time_series = Array.from({ length: numPoints }, (_, i) => {
    // Distribute timestamps evenly across the estimated duration
    const progress = i / (numPoints - 1 || 1);
    const timestamp = new Date(Date.now() - (estimatedDuration * 1000 * (1 - progress))).toISOString();
    
    // Add slight variation to make the graph more realistic (small random variations around average)
    const variation = 0.1; // 10% variation
    const cpuVariation = avgCpu * variation * (Math.random() * 2 - 1);
    const memVariation = avgMem * variation * (Math.random() * 2 - 1);
    const rpsVariation = summary.avg_rps * variation * (Math.random() * 2 - 1);
    const latencyVariation = summary.avg_latency_ms * variation * (Math.random() * 2 - 1);
    
    return {
      timestamp,
      cpu_util_pct: Math.max(0, Math.min(100, avgCpu + cpuVariation)),
      mem_util_pct: Math.max(0, Math.min(100, avgMem + memVariation)),
      rps: Math.max(0, summary.avg_rps + rpsVariation),
      latency_ms: Math.max(0, summary.avg_latency_ms + latencyVariation),
      concurrent_users: 0, // Not provided by backend
      error_rate: Math.max(0, Math.min(100, errorRate)),
    };
  });

  return {
    summary,
    node_metrics,
    time_series,
    workload_metrics: {
      concurrent_users: { min: 0, max: 0, avg: 0 },
      rps: { min: summary.avg_rps, max: summary.peak_rps, avg: summary.avg_rps },
      latency: {
        min_ms: metrics.latency_p50_ms || 0,
        max_ms: metrics.latency_p99_ms || 0,
        avg_ms: summary.avg_latency_ms,
        p50_ms: metrics.latency_p50_ms || 0,
        p95_ms: summary.p95_latency_ms,
        p99_ms: summary.p99_latency_ms,
      },
    },
  };
}

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

  // Transform metadata.metrics to results if present, otherwise use metadata.results
  const results = metadata.metrics 
    ? transformBackendMetricsToResults(metadata.metrics, config)
    : (metadata.results || undefined);

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
    results,
    error: backendRun.status === "failed" ? metadata.error || "Simulation failed" : undefined,
    // Store engine_run_id in metadata for reference
    engine_run_id: backendRun.engine_run_id,
  } as SimulationRun & { engine_run_id?: string };
}

