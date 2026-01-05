// Dummy data generator that emulates simulation-core responses

import { 
  SimulationRun, 
  SimulationStatus, 
  TimeSeriesData, 
  OptimizationResult,
  OptimizationStep,
  SimulationConfig 
} from "@/types/simulation";

// Generate time series data for a simulation run
function generateTimeSeriesData(
  durationSeconds: number,
  intervalSeconds: number = 5
): TimeSeriesData[] {
  const data: TimeSeriesData[] = [];
  const startTime = new Date(Date.now() - durationSeconds * 1000);
  
  for (let i = 0; i < durationSeconds; i += intervalSeconds) {
    const timestamp = new Date(startTime.getTime() + i * 1000);
    const progress = i / durationSeconds;
    
    // Simulate realistic metrics with some variance
    const baseCpu = 40 + Math.sin(progress * Math.PI * 2) * 20 + Math.random() * 10;
    const baseMem = 50 + Math.cos(progress * Math.PI * 2) * 15 + Math.random() * 8;
    const baseRps = 1000 + Math.sin(progress * Math.PI) * 500 + Math.random() * 200;
    const baseLatency = 50 + Math.sin(progress * Math.PI * 3) * 30 + Math.random() * 15;
    const baseUsers = 1500 + Math.sin(progress * Math.PI) * 500 + Math.random() * 200;
    
    data.push({
      timestamp: timestamp.toISOString(),
      cpu_util_pct: Math.max(0, Math.min(100, baseCpu)),
      mem_util_pct: Math.max(0, Math.min(100, baseMem)),
      rps: Math.max(0, baseRps),
      latency_ms: Math.max(0, baseLatency),
      concurrent_users: Math.max(0, baseUsers),
      error_rate: Math.max(0, Math.min(5, Math.random() * 2)),
    });
  }
  
  return data;
}

// Generate optimization step data
function generateOptimizationSteps(
  initialConfig: SimulationConfig,
  objectiveFunction: string = "p95_latency_ms"
): OptimizationStep[] {
  const steps: OptimizationStep[] = [];
  const maxIterations = 8 + Math.floor(Math.random() * 7); // 8-15 iterations
  
  let currentNodes = initialConfig.nodes;
  let currentVcpu = initialConfig.resources.vcpu_per_node;
  let currentMemory = initialConfig.resources.memory_gb_per_node;
  let bestScore = 200; // Starting score (higher is worse for latency)
  
  for (let i = 0; i < maxIterations; i++) {
    // Simulate hill-climbing: gradually improve (lower score for latency)
    const improvement = i < 5 ? 15 - i * 2 : Math.random() * 3 - 1; // Larger improvements early
    const score = Math.max(50, bestScore - improvement);
    bestScore = score;
    
    // Occasionally adjust configuration (replicas, resources)
    if (i > 0 && Math.random() > 0.6) {
      if (Math.random() > 0.5 && currentNodes < 10) {
        currentNodes += 1;
      } else if (currentNodes > 3) {
        currentNodes -= 1;
      }
    }
    
    if (i > 2 && Math.random() > 0.7) {
      currentVcpu = Math.max(4, Math.min(16, currentVcpu + (Math.random() > 0.5 ? 2 : -2)));
    }
    
    const config: SimulationConfig = {
      ...initialConfig,
      nodes: currentNodes,
      resources: {
        vcpu_per_node: currentVcpu,
        memory_gb_per_node: currentMemory,
      },
    };
    
    steps.push({
      iteration: i,
      score: score,
      config: config,
      run_id: `opt-run-${i + 1}`,
      status: "completed",
      metrics: {
        p95_latency_ms: score,
        p99_latency_ms: score * 1.5,
        avg_latency_ms: score * 0.6,
        throughput_rps: 1200 + Math.random() * 400,
        error_rate: Math.max(0, Math.min(2, score / 100)),
        cpu_utilization: 60 + Math.random() * 20,
        memory_utilization: 55 + Math.random() * 15,
      },
    });
  }
  
  return steps;
}

// Generate optimization result data
function generateOptimizationResult(
  initialConfig: SimulationConfig,
  objectiveFunction: string = "p95_latency_ms"
): OptimizationResult {
  const history = generateOptimizationSteps(initialConfig, objectiveFunction);
  const bestStep = history.reduce((best, step) => 
    step.score < best.score ? step : best
  );
  
  return {
    best_config: bestStep.config,
    best_score: bestStep.score,
    best_run_id: bestStep.run_id,
    iterations: history.length,
    history: history,
    converged: true,
    convergence_reason: "no_improvement",
    total_runs: history.length,
    completed_runs: history.length,
    failed_runs: 0,
    duration_seconds: history.length * 45, // ~45 seconds per iteration
    objective_function: objectiveFunction,
  };
}

// Generate dummy simulation runs
export function generateDummySimulationRuns(): SimulationRun[] {
  const now = new Date();
  const runs: SimulationRun[] = [];

  // Completed run config (defined separately to avoid initialization error)
  const completedRunConfig: SimulationConfig = {
    nodes: 5,
    workload: {
      concurrent_users: 2000,
      rps_target: 1500,
      duration_seconds: 1800,
      ramp_up_seconds: 300,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "high_load",
    description: "Testing system under high concurrent user load",
  };

  // Completed run
  const completedRun: SimulationRun = {
    id: "sim-run-001",
    name: "High Load Test - 2000 Users",
    status: "completed",
    created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 2 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    duration_seconds: 1800,
    config: completedRunConfig,
    results: {
      summary: {
        total_requests: 2700000,
        successful_requests: 2686500,
        failed_requests: 13500,
        avg_latency_ms: 65.5,
        p95_latency_ms: 125.3,
        p99_latency_ms: 198.7,
        avg_rps: 1500,
        peak_rps: 1850,
      },
      node_metrics: [
        {
          node_id: "node-1",
          spec: { vcpu: 8, memory_gb: 16, label: "web-1" },
          avg_cpu_util_pct: 72.5,
          avg_mem_util_pct: 61.2,
          peak_cpu_util_pct: 89.3,
          peak_mem_util_pct: 75.8,
          network_io_mbps: 125.5,
        },
        {
          node_id: "node-2",
          spec: { vcpu: 8, memory_gb: 16, label: "web-2" },
          avg_cpu_util_pct: 68.3,
          avg_mem_util_pct: 58.7,
          peak_cpu_util_pct: 85.1,
          peak_mem_util_pct: 72.3,
          network_io_mbps: 118.2,
        },
        {
          node_id: "node-3",
          spec: { vcpu: 8, memory_gb: 16, label: "api-1" },
          avg_cpu_util_pct: 75.1,
          avg_mem_util_pct: 64.5,
          peak_cpu_util_pct: 91.2,
          peak_mem_util_pct: 78.9,
          network_io_mbps: 132.8,
        },
        {
          node_id: "node-4",
          spec: { vcpu: 8, memory_gb: 16, label: "api-2" },
          avg_cpu_util_pct: 70.8,
          avg_mem_util_pct: 59.3,
          peak_cpu_util_pct: 87.5,
          peak_mem_util_pct: 73.1,
          network_io_mbps: 121.4,
        },
        {
          node_id: "node-5",
          spec: { vcpu: 8, memory_gb: 16, label: "db-1" },
          avg_cpu_util_pct: 45.2,
          avg_mem_util_pct: 55.8,
          peak_cpu_util_pct: 62.3,
          peak_mem_util_pct: 68.4,
          network_io_mbps: 95.7,
        },
      ],
      time_series: generateTimeSeriesData(1800, 10),
      workload_metrics: {
        concurrent_users: {
          min: 500,
          max: 2100,
          avg: 1850,
        },
        rps: {
          min: 800,
          max: 1850,
          avg: 1500,
        },
        latency: {
          min_ms: 25.3,
          max_ms: 450.2,
          avg_ms: 65.5,
          p50_ms: 58.2,
          p95_ms: 125.3,
          p99_ms: 198.7,
        },
      },
      optimization: generateOptimizationResult(completedRunConfig, "p95_latency_ms"),
    },
  };

  // Running simulation
  const runningRun: SimulationRun = {
    id: "sim-run-002",
    name: "Stress Test - 3000 Users",
    status: "running",
    created_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 15 * 60 * 1000 + 3 * 1000).toISOString(),
    duration_seconds: 900, // 15 minutes so far
    config: {
      nodes: 7,
      workload: {
        concurrent_users: 3000,
        rps_target: 2000,
        duration_seconds: 3600,
        ramp_up_seconds: 600,
      },
      resources: {
        vcpu_per_node: 10,
        memory_gb_per_node: 32,
      },
      scenario: "stress_test",
      description: "Stress testing with maximum expected load",
    },
    results: {
      summary: {
        total_requests: 1350000,
        successful_requests: 1336500,
        failed_requests: 13500,
        avg_latency_ms: 78.2,
        p95_latency_ms: 145.8,
        p99_latency_ms: 225.4,
        avg_rps: 1500,
        peak_rps: 1950,
      },
      node_metrics: [
        {
          node_id: "node-1",
          spec: { vcpu: 10, memory_gb: 32, label: "web-1" },
          avg_cpu_util_pct: 82.3,
          avg_mem_util_pct: 68.5,
          peak_cpu_util_pct: 94.1,
          peak_mem_util_pct: 82.3,
          network_io_mbps: 145.2,
        },
        {
          node_id: "node-2",
          spec: { vcpu: 10, memory_gb: 32, label: "web-2" },
          avg_cpu_util_pct: 79.1,
          avg_mem_util_pct: 65.8,
          peak_cpu_util_pct: 91.5,
          peak_mem_util_pct: 79.6,
          network_io_mbps: 138.7,
        },
        {
          node_id: "node-3",
          spec: { vcpu: 10, memory_gb: 32, label: "api-1" },
          avg_cpu_util_pct: 85.7,
          avg_mem_util_pct: 71.2,
          peak_cpu_util_pct: 96.3,
          peak_mem_util_pct: 85.1,
          network_io_mbps: 152.4,
        },
        {
          node_id: "node-4",
          spec: { vcpu: 10, memory_gb: 32, label: "api-2" },
          avg_cpu_util_pct: 81.5,
          avg_mem_util_pct: 67.9,
          peak_cpu_util_pct: 93.2,
          peak_mem_util_pct: 81.4,
          network_io_mbps: 142.8,
        },
        {
          node_id: "node-5",
          spec: { vcpu: 10, memory_gb: 32, label: "api-3" },
          avg_cpu_util_pct: 83.8,
          avg_mem_util_pct: 69.1,
          peak_cpu_util_pct: 95.4,
          peak_mem_util_pct: 83.7,
          network_io_mbps: 148.6,
        },
        {
          node_id: "node-6",
          spec: { vcpu: 10, memory_gb: 32, label: "cache-1" },
          avg_cpu_util_pct: 55.2,
          avg_mem_util_pct: 72.3,
          peak_cpu_util_pct: 68.9,
          peak_mem_util_pct: 85.2,
          network_io_mbps: 112.3,
        },
        {
          node_id: "node-7",
          spec: { vcpu: 10, memory_gb: 32, label: "db-1" },
          avg_cpu_util_pct: 52.8,
          avg_mem_util_pct: 58.4,
          peak_cpu_util_pct: 65.1,
          peak_mem_util_pct: 72.8,
          network_io_mbps: 98.5,
        },
      ],
      time_series: generateTimeSeriesData(900, 10),
      workload_metrics: {
        concurrent_users: {
          min: 800,
          max: 3100,
          avg: 2750,
        },
        rps: {
          min: 1200,
          max: 1950,
          avg: 1650,
        },
        latency: {
          min_ms: 32.1,
          max_ms: 520.8,
          avg_ms: 78.2,
          p50_ms: 68.5,
          p95_ms: 145.8,
          p99_ms: 225.4,
        },
      },
    },
  };

  // Pending simulation
  const pendingRun: SimulationRun = {
    id: "sim-run-003",
    name: "Baseline Test - 1000 Users",
    status: "pending",
    created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    config: {
      nodes: 3,
      workload: {
        concurrent_users: 1000,
        rps_target: 800,
        duration_seconds: 1200,
        ramp_up_seconds: 180,
      },
      resources: {
        vcpu_per_node: 4,
        memory_gb_per_node: 8,
      },
      scenario: "baseline",
      description: "Baseline performance test",
    },
  };

  // Failed simulation
  const failedRun: SimulationRun = {
    id: "sim-run-004",
    name: "Overload Test - 5000 Users",
    status: "failed",
    created_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 4 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    duration_seconds: 600,
    config: {
      nodes: 5,
      workload: {
        concurrent_users: 5000,
        rps_target: 3000,
        duration_seconds: 3600,
        ramp_up_seconds: 300,
      },
      resources: {
        vcpu_per_node: 8,
        memory_gb_per_node: 16,
      },
      scenario: "overload",
      description: "Testing system limits",
    },
    error: "System overloaded: CPU utilization exceeded 95% threshold for more than 5 minutes",
  };

  runs.push(completedRun, runningRun, pendingRun, failedRun);
  return runs;
}

// Get a single simulation run by ID
export function getDummySimulationRun(id: string): SimulationRun | null {
  const runs = generateDummySimulationRuns();
  return runs.find((run) => run.id === id) || null;
}

