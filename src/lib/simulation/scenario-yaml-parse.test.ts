import { describe, expect, it } from "vitest";
import { SAMPLE_SCENARIO_V2_YAML } from "./sample-scenario-v2-yaml";
import { parseSimulationScenarioYaml, scenarioStateToYaml } from "./scenario-yaml-parse";

const BACKEND_SERVICE_FIELDS_YAML = `
hosts:
  - id: h1
    cores: 4
services:
  - id: svc1
    replicas: 2
    kind: web
    role: primary
    scaling:
      min: 1
      max: 10
    x_custom: true
    model: cpu
    cpu_cores: 1
    memory_mb: 512
    endpoints:
      - path: /api
        mean_cpu_ms: 10
        cpu_sigma_ms: 2
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 5
          sigma: 1
workload:
  - from: client
    to: svc1:/api
    arrival:
      type: poisson
      rate_rps: 1
policies: {}
`.trim();

const AUTOSCALING_WITH_EXTRAS_AND_ROWS = `
hosts:
  - id: h1
    cores: 4
services:
  - id: s1
    replicas: 1
    model: cpu
    cpu_cores: 1
    memory_mb: 512
    endpoints:
      - path: /x
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/x
    arrival:
      type: poisson
      rate_rps: 1
policies:
  autoscaling:
    enabled: true
    target_cpu_util: 0.65
    scale_step: 1
    services:
      - service_id: s1
        min_replicas: 1
        max_replicas: 3
        target_p95_latency_ms: 100
        target_cpu_utilization: 0.7
        scale_up_step: 1
        scale_down_step: 1
        row_extra: 7
  retries:
    enabled: true
    max_retries: 2
`.trim();

const AUTOSCALING_EMPTY_SERVICES_WITH_EXTRAS = `
hosts:
  - id: h1
    cores: 4
services:
  - id: s1
    replicas: 1
    model: cpu
    cpu_cores: 1
    memory_mb: 512
    endpoints:
      - path: /x
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/x
    arrival:
      type: poisson
      rate_rps: 1
policies:
  autoscaling:
    enabled: true
    scale_step: 1
    services: []
  retries:
    enabled: true
`.trim();

const AUTOSCALING_NO_SERVICES_KEY = `
hosts:
  - id: h1
    cores: 4
services:
  - id: s1
    replicas: 1
    model: cpu
    cpu_cores: 1
    memory_mb: 512
    endpoints:
      - path: /x
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/x
    arrival:
      type: poisson
      rate_rps: 1
policies:
  autoscaling:
    cooldown_ms: 5000
  retries:
    enabled: true
    backoff: exponential
`.trim();

describe("scenario-yaml-parse", () => {
  it("round-trips backend-owned service fields and unknown keys without dropping them", () => {
    const first = parseSimulationScenarioYaml(BACKEND_SERVICE_FIELDS_YAML);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const out = scenarioStateToYaml(first.state).trim();
    expect(out).toContain("kind: web");
    expect(out).toContain("role: primary");
    expect(out).toContain("scaling:");
    expect(out).toContain("x_custom: true");

    const second = parseSimulationScenarioYaml(out);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(scenarioStateToYaml(second.state).trim()).toBe(out);
  });

  it("stable canonical form: parse → serialize matches for saved draft sync", () => {
    const p = parseSimulationScenarioYaml(BACKEND_SERVICE_FIELDS_YAML);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const canonical = scenarioStateToYaml(p.state).trim();
    const again = parseSimulationScenarioYaml(canonical);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(scenarioStateToYaml(again.state).trim()).toBe(canonical);
  });

  it("preserves autoscaling-level extras with service rows and row extras", () => {
    const p = parseSimulationScenarioYaml(AUTOSCALING_WITH_EXTRAS_AND_ROWS);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const pol = p.state.policies?.autoscaling;
    expect(pol?.extra?.enabled).toBe(true);
    expect(pol?.extra?.target_cpu_util).toBe(0.65);
    expect(pol?.extra?.scale_step).toBe(1);
    expect(pol?.services[0]?.extra?.row_extra).toBe(7);
    expect((p.state.policies?.retries as { enabled?: boolean } | undefined)?.enabled).toBe(true);
    const out = scenarioStateToYaml(p.state).trim();
    expect(out).toContain("enabled: true");
    expect(out).toContain("target_cpu_util: 0.65");
    expect(out).toContain("scale_step: 1");
    expect(out).toContain("row_extra: 7");
    expect(out).toContain("retries:");
    expect(out).toContain("max_retries: 2");
    const p2 = parseSimulationScenarioYaml(out);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(scenarioStateToYaml(p2.state).trim()).toBe(out);
  });

  it("preserves autoscaling-level extras when services is empty", () => {
    const p = parseSimulationScenarioYaml(AUTOSCALING_EMPTY_SERVICES_WITH_EXTRAS);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.state.policies?.autoscaling?.extra?.enabled).toBe(true);
    expect(p.state.policies?.autoscaling?.extra?.scale_step).toBe(1);
    expect(p.state.policies?.autoscaling?.services).toEqual([]);
    expect((p.state.policies?.retries as { enabled?: boolean } | undefined)?.enabled).toBe(true);
    const out = scenarioStateToYaml(p.state).trim();
    expect(out).toContain("enabled: true");
    expect(out).toContain("scale_step: 1");
    expect(out).toMatch(/services:\s*\n\s*\[\]/);
    expect(out).toContain("retries:");
    const p2 = parseSimulationScenarioYaml(out);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(scenarioStateToYaml(p2.state).trim()).toBe(out);
  });

  it("preserves autoscaling-level extras when services key is absent", () => {
    const p = parseSimulationScenarioYaml(AUTOSCALING_NO_SERVICES_KEY);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.state.policies?.autoscaling?.extra?.cooldown_ms).toBe(5000);
    expect(p.state.policies?.autoscaling?.services).toEqual([]);
    expect((p.state.policies?.retries as { backoff?: string } | undefined)?.backoff).toBe("exponential");
    const out = scenarioStateToYaml(p.state).trim();
    expect(out).toContain("cooldown_ms: 5000");
    expect(out).toContain("services:");
    expect(out).toContain("retries:");
    expect(out).toContain("backoff: exponential");
    const p2 = parseSimulationScenarioYaml(out);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(scenarioStateToYaml(p2.state).trim()).toBe(out);
  });

  it("ScenarioV2 bundled sample: parse → scenarioStateToYaml preserves representative v2 fields", () => {
    const first = parseSimulationScenarioYaml(SAMPLE_SCENARIO_V2_YAML);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const out = scenarioStateToYaml(first.state).trim();
    expect(out).toMatch(/schema_version:\s*(?:0\.2\.0|"0\.2\.0")/);
    expect(out).toContain("simulation_limits:");
    expect(out).toContain("max_trace_depth: 48");
    expect(out).toContain("max_async_hops: 12");
    expect(out).toContain("zone: zone-a");
    expect(out).toContain("rack: r1");
    expect(out).toContain("tier: edge");
    expect(out).toContain("kind: api_gateway");
    expect(out).toContain("role: ingress");
    expect(out).toContain("strategy: least_queue");
    expect(out).toContain("locality_zone_from: client_zone");
    expect(out).toContain("horizontal: true");
    expect(out).toContain("required_zones:");
    expect(out).toContain("spread_across_zones: true");
    expect(out).toContain("kind: queue");
    expect(out).toContain("consumer_concurrency: 2");
    expect(out).toContain("kind: topic");
    expect(out).toContain("publish_ack: leader_ack");
    expect(out).toContain("kind: database");
    expect(out).toContain("kind: cache");
    expect(out).toContain("hit_rate: 0.78");
    expect(out).toContain("kind: external");
    expect(out).toContain("source_kind: client");
    expect(out).toContain("traffic_class: ingress");
    expect(out).toContain("client_zone: zone-a");
    expect(out).toContain("source_kind: batch_job");
    expect(out).toContain("traffic_class: background");
    expect(out).toContain("type: constant");
    expect(out).toContain("enabled: true");
    expect(out).toContain("target_cpu_util: 0.65");
    expect(out).toContain("scale_step: 1");
    expect(out).toContain("retries:");
    expect(out).toContain("max_retries: 2");
    expect(out).toContain("backoff: exponential");

    const second = parseSimulationScenarioYaml(out);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(scenarioStateToYaml(second.state).trim()).toBe(out);
  });
});
