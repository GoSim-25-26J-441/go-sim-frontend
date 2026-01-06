// Simulation templates based on simulation-core sample configs

import { SimulationConfig } from "@/types/simulation";

export interface SimulationTemplate {
  id: string;
  name: string;
  description: string;
  config: SimulationConfig;
  scenarioYaml?: string; // Optional: full scenario YAML for simulation-core
}

export const SIMULATION_TEMPLATES: SimulationTemplate[] = [
  {
    id: "simple-ecommerce",
    name: "Simple E-commerce",
    description: "Basic e-commerce simulation with gateway, users, orders, and payments services",
    config: {
      nodes: 4,
      workload: {
        concurrent_users: 500,
        rps_target: 500,
        duration_seconds: 60,
        ramp_up_seconds: 5,
      },
      resources: {
        vcpu_per_node: 4,
        memory_gb_per_node: 8,
      },
      scenario: "simple-ecommerce",
      description: "Simple e-commerce microservices architecture",
    },
    scenarioYaml: `hosts:
  - id: host-1
    cores: 4

services:
  - id: gateway
    replicas: 2
    model: cpu
    cpu_cores: 4.0
    memory_mb: 8192.0
    endpoints:
      - path: /api/gateway
        mean_cpu_ms: 2
        cpu_sigma_ms: 1
        default_memory_mb: 10.0
        downstream:
          - to: users:/api/users
            call_count_mean: 1
            call_latency_ms:
              mean: 5
              sigma: 2
            downstream_fraction_cpu: 0.3
          - to: orders:/api/orders
            call_count_mean: 0.6
            call_latency_ms:
              mean: 8
              sigma: 3
            downstream_fraction_cpu: 0.4
        net_latency_ms:
          mean: 1
          sigma: 0.5
  
  - id: users
    replicas: 2
    model: cpu
    cpu_cores: 4.0
    memory_mb: 8192.0
    endpoints:
      - path: /api/users
        mean_cpu_ms: 6
        cpu_sigma_ms: 3
        default_memory_mb: 15.0
        downstream: []
        net_latency_ms:
          mean: 2
          sigma: 1
  
  - id: orders
    replicas: 2
    model: cpu
    cpu_cores: 4.0
    memory_mb: 8192.0
    endpoints:
      - path: /api/orders
        mean_cpu_ms: 10
        cpu_sigma_ms: 5
        default_memory_mb: 20.0
        downstream:
          - to: payments:/api/payments
            call_count_mean: 0.4
            call_latency_ms:
              mean: 15
              sigma: 5
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 3
          sigma: 1
  
  - id: payments
    replicas: 1
    model: cpu
    cpu_cores: 4.0
    memory_mb: 8192.0
    endpoints:
      - path: /api/payments
        mean_cpu_ms: 15
        cpu_sigma_ms: 8
        default_memory_mb: 25.0
        downstream: []
        net_latency_ms:
          mean: 2
          sigma: 1

workload:
  - from: client
    to: gateway:/api/gateway
    arrival:
      type: poisson
      rate_rps: 500.0`,
  },
  {
    id: "auth-service",
    name: "Auth Service",
    description: "Authentication service simulation with login and verification endpoints",
    config: {
      nodes: 3,
      workload: {
        concurrent_users: 200,
        rps_target: 20,
        duration_seconds: 60,
        ramp_up_seconds: 5,
      },
      resources: {
        vcpu_per_node: 2,
        memory_gb_per_node: 4,
      },
      scenario: "auth-service",
      description: "Authentication service with user and database dependencies",
    },
    scenarioYaml: `hosts:
  - id: host-1
    cores: 2

services:
  - id: auth
    replicas: 2
    model: cpu
    cpu_cores: 2.0
    memory_mb: 1024.0
    endpoints:
      - path: /auth/login
        mean_cpu_ms: 50
        cpu_sigma_ms: 20
        default_memory_mb: 15.0
        downstream: []
        net_latency_ms:
          mean: 2
          sigma: 1
      - path: /auth/verify
        mean_cpu_ms: 5
        cpu_sigma_ms: 3
        default_memory_mb: 5.0
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 0.5

  - id: user
    replicas: 2
    model: mixed
    endpoints:
      - path: /user/get
        mean_cpu_ms: 12
        cpu_sigma_ms: 6
        downstream:
          - to: db:/db/query
            call_count_mean: 1
            call_latency_ms:
              mean: 10
              sigma: 5
            downstream_fraction_cpu: 0.6
        net_latency_ms:
          mean: 3
          sigma: 1
      - path: /user/update
        mean_cpu_ms: 25
        cpu_sigma_ms: 12
        downstream:
          - to: db:/db/query
            call_count_mean: 1
            call_latency_ms:
              mean: 15
              sigma: 8
            downstream_fraction_cpu: 0.7
        net_latency_ms:
          mean: 3
          sigma: 1

  - id: db
    replicas: 1
    model: db_latency
    endpoints:
      - path: /db/query
        mean_cpu_ms: 5
        cpu_sigma_ms: 2
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 0.5

workload:
  - from: client
    to: auth:/auth/login
    arrival:
      type: poisson
      rate_rps: 20.0
  - from: client
    to: user:/user/get
    arrival:
      type: poisson
      rate_rps: 5.0`,
  },
  {
    id: "high-load",
    name: "High Load",
    description: "High-traffic simulation for stress testing",
    config: {
      nodes: 5,
      workload: {
        concurrent_users: 5000,
        rps_target: 2000,
        duration_seconds: 300,
        ramp_up_seconds: 60,
      },
      resources: {
        vcpu_per_node: 8,
        memory_gb_per_node: 16,
      },
      scenario: "high-load",
      description: "High-load stress test configuration",
    },
  },
  {
    id: "low-latency",
    name: "Low Latency",
    description: "Optimized for low latency with fewer nodes",
    config: {
      nodes: 2,
      workload: {
        concurrent_users: 100,
        rps_target: 100,
        duration_seconds: 120,
        ramp_up_seconds: 10,
      },
      resources: {
        vcpu_per_node: 8,
        memory_gb_per_node: 16,
      },
      scenario: "low-latency",
      description: "Low latency optimized configuration",
    },
  },
];

/**
 * Get a template by ID
 */
export function getTemplate(id: string): SimulationTemplate | undefined {
  return SIMULATION_TEMPLATES.find((t) => t.id === id);
}

