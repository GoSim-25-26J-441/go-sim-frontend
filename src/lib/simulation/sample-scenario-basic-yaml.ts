/** Bundled basic sample (legacy users/login demo). */
export const SAMPLE_BASIC_YAML = `hosts:
  - id: host-1
    cores: 4
    memory_gb: 16

services:
  - id: users
    replicas: 2
    model: cpu
    cpu_cores: 1.0
    memory_mb: 512
    endpoints:
      - path: /login
        mean_cpu_ms: 10
        cpu_sigma_ms: 2
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 5
          sigma: 1

workload:
  - from: client
    to: users:/login
    arrival:
      type: poisson
      rate_rps: 10
      stddev_rps: 0
      burst_rate_rps: 0
      burst_duration_seconds: 0
      quiet_duration_seconds: 0
`;
