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

/**
 * Generate demo simulation runs that will always be displayed alongside real runs
 * These are for demonstration purposes and have distinct "demo-" prefixed IDs
 */
export function getDemoSimulationRuns(): SimulationRun[] {
  const now = new Date();
  const runs: SimulationRun[] = [];

  // Demo 1: Completed E-commerce Simulation
  const ecommerceConfig: SimulationConfig = {
    nodes: 8,
    workload: {
      concurrent_users: 2500,
      rps_target: 1800,
      duration_seconds: 2400,
      ramp_up_seconds: 300,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "ecommerce",
    description: "E-commerce platform under Black Friday load",
  };

  const ecommerceRun: SimulationRun = {
    id: "demo-ecommerce-001",
    name: "E-commerce Black Friday Simulation",
    status: "completed",
    created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 2400 * 1000).toISOString(),
    duration_seconds: 2400,
    config: ecommerceConfig,
    results: {
      summary: {
        total_requests: 4320000,
        successful_requests: 4285000,
        failed_requests: 35000,
        avg_latency_ms: 85.3,
        p95_latency_ms: 185.7,
        p99_latency_ms: 285.2,
        avg_rps: 1800,
        peak_rps: 2250,
      },
      node_metrics: [
        {
          node_id: "node-1",
          spec: { vcpu: 8, memory_gb: 16, label: "frontend-1" },
          avg_cpu_util_pct: 78.5,
          avg_mem_util_pct: 65.2,
          peak_cpu_util_pct: 92.1,
          peak_mem_util_pct: 82.3,
          network_io_mbps: 145.8,
        },
        {
          node_id: "node-2",
          spec: { vcpu: 8, memory_gb: 16, label: "frontend-2" },
          avg_cpu_util_pct: 76.2,
          avg_mem_util_pct: 63.8,
          peak_cpu_util_pct: 90.5,
          peak_mem_util_pct: 80.1,
          network_io_mbps: 142.3,
        },
        {
          node_id: "node-3",
          spec: { vcpu: 8, memory_gb: 16, label: "api-1" },
          avg_cpu_util_pct: 82.3,
          avg_mem_util_pct: 68.5,
          peak_cpu_util_pct: 95.2,
          peak_mem_util_pct: 85.7,
          network_io_mbps: 158.2,
        },
        {
          node_id: "node-4",
          spec: { vcpu: 8, memory_gb: 16, label: "api-2" },
          avg_cpu_util_pct: 80.1,
          avg_mem_util_pct: 66.9,
          peak_cpu_util_pct: 93.8,
          peak_mem_util_pct: 83.4,
          network_io_mbps: 152.7,
        },
        {
          node_id: "node-5",
          spec: { vcpu: 8, memory_gb: 16, label: "payment-1" },
          avg_cpu_util_pct: 55.8,
          avg_mem_util_pct: 52.3,
          peak_cpu_util_pct: 72.4,
          peak_mem_util_pct: 68.9,
          network_io_mbps: 98.5,
        },
        {
          node_id: "node-6",
          spec: { vcpu: 8, memory_gb: 16, label: "inventory-1" },
          avg_cpu_util_pct: 68.2,
          avg_mem_util_pct: 58.7,
          peak_cpu_util_pct: 85.3,
          peak_mem_util_pct: 75.2,
          network_io_mbps: 125.4,
        },
        {
          node_id: "node-7",
          spec: { vcpu: 8, memory_gb: 16, label: "cache-1" },
          avg_cpu_util_pct: 62.5,
          avg_mem_util_pct: 72.8,
          peak_cpu_util_pct: 78.9,
          peak_mem_util_pct: 88.5,
          network_io_mbps: 112.6,
        },
        {
          node_id: "node-8",
          spec: { vcpu: 8, memory_gb: 16, label: "db-1" },
          avg_cpu_util_pct: 58.3,
          avg_mem_util_pct: 64.2,
          peak_cpu_util_pct: 75.6,
          peak_mem_util_pct: 78.4,
          network_io_mbps: 108.3,
        },
      ],
      time_series: generateTimeSeriesData(2400, 10),
      workload_metrics: {
        concurrent_users: {
          min: 800,
          max: 2650,
          avg: 2350,
        },
        rps: {
          min: 1200,
          max: 2250,
          avg: 1800,
        },
        latency: {
          min_ms: 28.5,
          max_ms: 580.3,
          avg_ms: 85.3,
          p50_ms: 72.1,
          p95_ms: 185.7,
          p99_ms: 285.2,
        },
      },
      optimization: generateOptimizationResult(ecommerceConfig, "p95_latency_ms"),
    },
  };

  // Demo 2: Completed Microservices Simulation
  const microservicesConfig: SimulationConfig = {
    nodes: 12,
    workload: {
      concurrent_users: 3500,
      rps_target: 2500,
      duration_seconds: 1800,
      ramp_up_seconds: 400,
    },
    resources: {
      vcpu_per_node: 4,
      memory_gb_per_node: 8,
    },
    scenario: "microservices",
    description: "Distributed microservices architecture load test",
  };

  const microservicesRun: SimulationRun = {
    id: "demo-microservices-001",
    name: "Microservices Architecture Test",
    status: "completed",
    created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 1800 * 1000).toISOString(),
    duration_seconds: 1800,
    config: microservicesConfig,
    results: {
      summary: {
        total_requests: 4500000,
        successful_requests: 4477500,
        failed_requests: 22500,
        avg_latency_ms: 125.8,
        p95_latency_ms: 285.3,
        p99_latency_ms: 425.7,
        avg_rps: 2500,
        peak_rps: 3120,
      },
      node_metrics: [
        {
          node_id: "node-1",
          spec: { vcpu: 4, memory_gb: 8, label: "gateway-1" },
          avg_cpu_util_pct: 85.2,
          avg_mem_util_pct: 72.5,
          peak_cpu_util_pct: 96.8,
          peak_mem_util_pct: 88.3,
          network_io_mbps: 185.2,
        },
        {
          node_id: "node-2",
          spec: { vcpu: 4, memory_gb: 8, label: "gateway-2" },
          avg_cpu_util_pct: 83.7,
          avg_mem_util_pct: 70.8,
          peak_cpu_util_pct: 95.1,
          peak_mem_util_pct: 86.5,
          network_io_mbps: 178.9,
        },
        {
          node_id: "node-3",
          spec: { vcpu: 4, memory_gb: 8, label: "user-service-1" },
          avg_cpu_util_pct: 72.3,
          avg_mem_util_pct: 65.2,
          peak_cpu_util_pct: 88.5,
          peak_mem_util_pct: 82.1,
          network_io_mbps: 145.6,
        },
        {
          node_id: "node-4",
          spec: { vcpu: 4, memory_gb: 8, label: "user-service-2" },
          avg_cpu_util_pct: 70.8,
          avg_mem_util_pct: 63.7,
          peak_cpu_util_pct: 86.9,
          peak_mem_util_pct: 80.4,
          network_io_mbps: 142.1,
        },
        {
          node_id: "node-5",
          spec: { vcpu: 4, memory_gb: 8, label: "order-service-1" },
          avg_cpu_util_pct: 78.5,
          avg_mem_util_pct: 68.9,
          peak_cpu_util_pct: 92.3,
          peak_mem_util_pct: 84.7,
          network_io_mbps: 162.4,
        },
        {
          node_id: "node-6",
          spec: { vcpu: 4, memory_gb: 8, label: "order-service-2" },
          avg_cpu_util_pct: 76.9,
          avg_mem_util_pct: 67.2,
          peak_cpu_util_pct: 90.7,
          peak_mem_util_pct: 83.1,
          network_io_mbps: 158.8,
        },
        {
          node_id: "node-7",
          spec: { vcpu: 4, memory_gb: 8, label: "payment-service-1" },
          avg_cpu_util_pct: 65.4,
          avg_mem_util_pct: 58.3,
          peak_cpu_util_pct: 82.5,
          peak_mem_util_pct: 75.6,
          network_io_mbps: 128.7,
        },
        {
          node_id: "node-8",
          spec: { vcpu: 4, memory_gb: 8, label: "notification-1" },
          avg_cpu_util_pct: 58.7,
          avg_mem_util_pct: 54.2,
          peak_cpu_util_pct: 75.3,
          peak_mem_util_pct: 70.8,
          network_io_mbps: 112.5,
        },
        {
          node_id: "node-9",
          spec: { vcpu: 4, memory_gb: 8, label: "notification-2" },
          avg_cpu_util_pct: 56.2,
          avg_mem_util_pct: 52.8,
          peak_cpu_util_pct: 73.1,
          peak_mem_util_pct: 68.9,
          network_io_mbps: 108.9,
        },
        {
          node_id: "node-10",
          spec: { vcpu: 4, memory_gb: 8, label: "redis-1" },
          avg_cpu_util_pct: 62.8,
          avg_mem_util_pct: 78.5,
          peak_cpu_util_pct: 79.4,
          peak_mem_util_pct: 91.2,
          network_io_mbps: 135.2,
        },
        {
          node_id: "node-11",
          spec: { vcpu: 4, memory_gb: 8, label: "postgres-1" },
          avg_cpu_util_pct: 68.5,
          avg_mem_util_pct: 71.3,
          peak_cpu_util_pct: 85.7,
          peak_mem_util_pct: 86.8,
          network_io_mbps: 152.6,
        },
        {
          node_id: "node-12",
          spec: { vcpu: 4, memory_gb: 8, label: "postgres-2" },
          avg_cpu_util_pct: 66.9,
          avg_mem_util_pct: 69.8,
          peak_cpu_util_pct: 83.9,
          peak_mem_util_pct: 85.1,
          network_io_mbps: 148.3,
        },
      ],
      time_series: generateTimeSeriesData(1800, 10),
      workload_metrics: {
        concurrent_users: {
          min: 1200,
          max: 3650,
          avg: 3300,
        },
        rps: {
          min: 1800,
          max: 3120,
          avg: 2500,
        },
        latency: {
          min_ms: 45.2,
          max_ms: 680.5,
          avg_ms: 125.8,
          p50_ms: 108.3,
          p95_ms: 285.3,
          p99_ms: 425.7,
        },
      },
      optimization: generateOptimizationResult(microservicesConfig, "p99_latency_ms"),
    },
  };

  // Demo 3: Completed API Gateway Performance Test
  const apiGatewayConfig: SimulationConfig = {
    nodes: 5,
    workload: {
      concurrent_users: 1800,
      rps_target: 1200,
      duration_seconds: 1200,
      ramp_up_seconds: 200,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "api_gateway",
    description: "API Gateway throughput and latency optimization",
  };

  const apiGatewayRun: SimulationRun = {
    id: "demo-api-gateway-001",
    name: "API Gateway Performance Test",
    status: "completed",
    created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 1200 * 1000).toISOString(),
    duration_seconds: 1200,
    config: apiGatewayConfig,
    results: {
      summary: {
        total_requests: 1440000,
        successful_requests: 1432800,
        failed_requests: 7200,
        avg_latency_ms: 42.5,
        p95_latency_ms: 85.3,
        p99_latency_ms: 125.8,
        avg_rps: 1200,
        peak_rps: 1520,
      },
      node_metrics: [
        {
          node_id: "node-1",
          spec: { vcpu: 8, memory_gb: 16, label: "gateway-1" },
          avg_cpu_util_pct: 68.5,
          avg_mem_util_pct: 58.2,
          peak_cpu_util_pct: 85.3,
          peak_mem_util_pct: 72.8,
          network_io_mbps: 125.4,
        },
        {
          node_id: "node-2",
          spec: { vcpu: 8, memory_gb: 16, label: "gateway-2" },
          avg_cpu_util_pct: 66.2,
          avg_mem_util_pct: 56.8,
          peak_cpu_util_pct: 83.1,
          peak_mem_util_pct: 70.5,
          network_io_mbps: 122.7,
        },
        {
          node_id: "node-3",
          spec: { vcpu: 8, memory_gb: 16, label: "gateway-3" },
          avg_cpu_util_pct: 65.8,
          avg_mem_util_pct: 56.3,
          peak_cpu_util_pct: 82.7,
          peak_mem_util_pct: 70.1,
          network_io_mbps: 121.9,
        },
        {
          node_id: "node-4",
          spec: { vcpu: 8, memory_gb: 16, label: "backend-1" },
          avg_cpu_util_pct: 55.3,
          avg_mem_util_pct: 48.7,
          peak_cpu_util_pct: 72.5,
          peak_mem_util_pct: 65.2,
          network_io_mbps: 98.5,
        },
        {
          node_id: "node-5",
          spec: { vcpu: 8, memory_gb: 16, label: "backend-2" },
          avg_cpu_util_pct: 53.9,
          avg_mem_util_pct: 47.2,
          peak_cpu_util_pct: 70.8,
          peak_mem_util_pct: 63.8,
          network_io_mbps: 96.2,
        },
      ],
      time_series: generateTimeSeriesData(1200, 10),
      workload_metrics: {
        concurrent_users: {
          min: 600,
          max: 1900,
          avg: 1700,
        },
        rps: {
          min: 900,
          max: 1520,
          avg: 1200,
        },
        latency: {
          min_ms: 18.5,
          max_ms: 220.3,
          avg_ms: 42.5,
          p50_ms: 38.2,
          p95_ms: 85.3,
          p99_ms: 125.8,
        },
      },
    },
  };

  // Demo 4: Cancelled - High Memory Usage
  const cancelledMemoryConfig: SimulationConfig = {
    nodes: 10,
    workload: {
      concurrent_users: 4000,
      rps_target: 3000,
      duration_seconds: 3600,
      ramp_up_seconds: 500,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "memory_stress",
    description: "Memory-intensive workload test - cancelled due to resource constraints",
  };

  const cancelledMemoryRun: SimulationRun = {
    id: "demo-cancelled-memory-001",
    name: "Memory Stress Test (Cancelled)",
    status: "cancelled",
    created_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 12 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 11 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString(),
    duration_seconds: 1800,
    config: cancelledMemoryConfig,
    error: "Simulation cancelled: Memory utilization exceeded safe thresholds (>90%)",
  };

  // Demo 5: Cancelled - Timeout
  const cancelledTimeoutConfig: SimulationConfig = {
    nodes: 15,
    workload: {
      concurrent_users: 6000,
      rps_target: 4500,
      duration_seconds: 7200,
      ramp_up_seconds: 600,
    },
    resources: {
      vcpu_per_node: 16,
      memory_gb_per_node: 32,
    },
    scenario: "extreme_load",
    description: "Extreme load test - cancelled after exceeding time limit",
  };

  const cancelledTimeoutRun: SimulationRun = {
    id: "demo-cancelled-timeout-001",
    name: "Extreme Load Test (Cancelled)",
    status: "cancelled",
    created_at: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 6 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 5 * 60 * 60 * 1000 - 45 * 60 * 1000).toISOString(),
    duration_seconds: 900,
    config: cancelledTimeoutConfig,
    error: "Simulation cancelled: Exceeded maximum allowed execution time",
  };

  // Demo 6: Failed - CPU Overload
  const failedCpuConfig: SimulationConfig = {
    nodes: 6,
    workload: {
      concurrent_users: 5000,
      rps_target: 3500,
      duration_seconds: 1800,
      ramp_up_seconds: 300,
    },
    resources: {
      vcpu_per_node: 4,
      memory_gb_per_node: 8,
    },
    scenario: "cpu_overload",
    description: "CPU overload test - insufficient resources allocated",
  };

  const failedCpuRun: SimulationRun = {
    id: "demo-failed-cpu-001",
    name: "CPU Overload Test (Failed)",
    status: "failed",
    created_at: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 18 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 17 * 60 * 60 * 1000 - 45 * 60 * 1000).toISOString(),
    duration_seconds: 450,
    config: failedCpuConfig,
    error: "Simulation failed: CPU utilization exceeded 95% threshold for more than 5 minutes on 4 out of 6 nodes. System unable to handle load.",
  };

  // Demo 7: Failed - Network Saturation
  const failedNetworkConfig: SimulationConfig = {
    nodes: 8,
    workload: {
      concurrent_users: 3500,
      rps_target: 2800,
      duration_seconds: 2400,
      ramp_up_seconds: 400,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "network_saturation",
    description: "Network bandwidth saturation test - exceeded network capacity",
  };

  const failedNetworkRun: SimulationRun = {
    id: "demo-failed-network-001",
    name: "Network Saturation Test (Failed)",
    status: "failed",
    created_at: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 30 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 30 * 60 * 60 * 1000 + 1200 * 1000).toISOString(),
    duration_seconds: 1200,
    config: failedNetworkConfig,
    error: "Simulation failed: Network I/O exceeded 95% of available bandwidth for more than 10 minutes. Significant packet loss detected (>5%).",
  };

  // Demo 8: Failed - Service Unavailability
  const failedServiceConfig: SimulationConfig = {
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
    scenario: "service_failure",
    description: "Service failure test - critical service became unavailable",
  };

  const failedServiceRun: SimulationRun = {
    id: "demo-failed-service-001",
    name: "Service Failure Test (Failed)",
    status: "failed",
    created_at: new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 36 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 36 * 60 * 60 * 1000 + 900 * 1000).toISOString(),
    duration_seconds: 900,
    config: failedServiceConfig,
    error: "Simulation failed: Database service became unresponsive after 15 minutes. Error rate exceeded 50%. Service health check failed.",
  };

  // Demo 9: Cancelled - User Requested
  const cancelledUserConfig: SimulationConfig = {
    nodes: 4,
    workload: {
      concurrent_users: 1500,
      rps_target: 1000,
      duration_seconds: 2400,
      ramp_up_seconds: 200,
    },
    resources: {
      vcpu_per_node: 4,
      memory_gb_per_node: 8,
    },
    scenario: "baseline_2",
    description: "Baseline performance test - cancelled by user",
  };

  const cancelledUserRun: SimulationRun = {
    id: "demo-cancelled-user-001",
    name: "Baseline Test (Cancelled by User)",
    status: "cancelled",
    created_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 4 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 4 * 60 * 60 * 1000 + 600 * 1000).toISOString(),
    duration_seconds: 600,
    config: cancelledUserConfig,
    error: "Simulation cancelled: User requested cancellation",
  };

  // Demo 10: Failed - Error Rate Threshold
  const failedErrorRateConfig: SimulationConfig = {
    nodes: 7,
    workload: {
      concurrent_users: 2800,
      rps_target: 2200,
      duration_seconds: 1800,
      ramp_up_seconds: 350,
    },
    resources: {
      vcpu_per_node: 8,
      memory_gb_per_node: 16,
    },
    scenario: "error_threshold",
    description: "Error rate threshold test - exceeded acceptable error rate",
  };

  const failedErrorRateRun: SimulationRun = {
    id: "demo-failed-errorrate-001",
    name: "Error Rate Threshold Test (Failed)",
    status: "failed",
    created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    started_at: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 5 * 1000).toISOString(),
    completed_at: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1050 * 1000).toISOString(),
    duration_seconds: 1050,
    config: failedErrorRateConfig,
    error: "Simulation failed: Error rate exceeded 10% threshold for more than 3 minutes. System experiencing critical failures. 15% of requests returned 5xx errors.",
  };

  runs.push(
    ecommerceRun, 
    microservicesRun, 
    apiGatewayRun,
    cancelledMemoryRun,
    cancelledTimeoutRun,
    cancelledUserRun,
    failedCpuRun,
    failedNetworkRun,
    failedServiceRun,
    failedErrorRateRun
  );
  return runs;
}

// Get a single simulation run by ID
// Cache for running simulation metrics to simulate progressive updates
const runningSimulationCache = new Map<string, {
  startTime: number;
  lastUpdate: number;
  baseMetrics: SimulationRun;
}>();

export function getDummySimulationRun(id: string): SimulationRun | null {
  const runs = generateDummySimulationRuns();
  const run = runs.find((r) => r.id === id);
  
  if (!run) return null;
  
  // If it's a running simulation, generate progressive metrics
  if (run.status === "running" && run.results) {
    const now = Date.now();
    const cached = runningSimulationCache.get(id);
    
    // Initialize cache if needed
    if (!cached) {
      runningSimulationCache.set(id, {
        startTime: run.started_at ? new Date(run.started_at).getTime() : now,
        lastUpdate: now,
        baseMetrics: JSON.parse(JSON.stringify(run)), // Deep clone
      });
      return run;
    }
    
    // Calculate elapsed time since start
    const elapsedSeconds = Math.floor((now - cached.startTime) / 1000);
    const elapsedSinceLastUpdate = (now - cached.lastUpdate) / 1000;
    
    // Only update if at least 2 seconds have passed (simulate real-time updates)
    if (elapsedSinceLastUpdate < 2) {
      return cached.baseMetrics;
    }
    
    // Update cache timestamp
    cached.lastUpdate = now;
    
    // Generate progressive metrics based on elapsed time
    const progress = Math.min(1, elapsedSeconds / (run.config.workload.duration_seconds || 3600));
    const variance = Math.sin(progress * Math.PI * 4) * 0.1 + Math.random() * 0.05;
    
    // Calculate new metrics
    const baseSummary = cached.baseMetrics.results!.summary;
    const rpsMultiplier = 1 + variance;
    const requestsSinceLastUpdate = baseSummary.avg_rps * elapsedSinceLastUpdate * rpsMultiplier;
    
    // Update summary metrics progressively
    const updatedRun: SimulationRun = {
      ...cached.baseMetrics,
      duration_seconds: elapsedSeconds,
      results: {
        ...cached.baseMetrics.results!,
        summary: {
          total_requests: Math.floor(baseSummary.total_requests + requestsSinceLastUpdate),
          successful_requests: Math.floor(baseSummary.successful_requests + requestsSinceLastUpdate * 0.99),
          failed_requests: Math.floor(baseSummary.failed_requests + requestsSinceLastUpdate * 0.01),
          avg_latency_ms: Math.max(0, baseSummary.avg_latency_ms * (1 + variance * 0.2)),
          p95_latency_ms: Math.max(0, baseSummary.p95_latency_ms * (1 + variance * 0.3)),
          p99_latency_ms: Math.max(0, baseSummary.p99_latency_ms * (1 + variance * 0.4)),
          avg_rps: Math.max(0, baseSummary.avg_rps * rpsMultiplier),
          peak_rps: Math.max(baseSummary.peak_rps, baseSummary.avg_rps * rpsMultiplier),
        },
        time_series: [
          ...cached.baseMetrics.results!.time_series,
          ...generateTimeSeriesData(
            Math.min(5, Math.floor(elapsedSinceLastUpdate)),
            1
          ).map((point, idx) => ({
            ...point,
            timestamp: new Date(now - (Math.min(5, Math.floor(elapsedSinceLastUpdate)) - idx) * 1000).toISOString(),
          })),
        ].slice(-200), // Keep last 200 data points
        node_metrics: cached.baseMetrics.results!.node_metrics.map((node) => ({
          ...node,
          avg_cpu_util_pct: Math.max(0, Math.min(100, node.avg_cpu_util_pct * (1 + variance * 0.1))),
          avg_mem_util_pct: Math.max(0, Math.min(100, node.avg_mem_util_pct * (1 + variance * 0.1))),
        })),
      },
    };
    
    // Update cache
    cached.baseMetrics = updatedRun;
    
    return updatedRun;
  }
  
  return run;
}

