import { describe, expect, it } from "vitest";
import { SAMPLE_SCENARIO_V2_YAML } from "./sample-scenario-v2-yaml";
import { parseSimulationScenarioYaml, scenarioStateToYaml } from "./scenario-yaml-parse";
import {
  addDownstreamCallToEndpoint,
  addEndpointToService,
  deleteEndpointIfUnreferenced,
  endpointTargetSet,
  findEndpointReferences,
  formatEndpointReferenceSummary,
  makeDefaultDownstreamCall,
  makeDefaultEndpoint,
  patchAutoscalingServiceRows,
  remapEndpointTargetKey,
  removeDownstreamCallFromEndpoint,
  validateEndpointTargets,
  validateWorkloadTargets,
} from "./scenario-behavior-helpers";
import type { ScenarioPolicies } from "./scenario-yaml-parse";

describe("scenario-behavior-helpers", () => {
  it("rejects workload target that is not an existing endpoint", () => {
    const parsed = parseSimulationScenarioYaml(`
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
    to: s1:/missing
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = validateWorkloadTargets(parsed.state);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("s1:/missing"))).toBe(true);
  });

  it("rejects downstream target that is not an existing endpoint", () => {
    const parsed = parseSimulationScenarioYaml(`
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
        downstream:
          - to: s1:/nope
            call_count_mean: 1
            call_latency_ms:
              mean: 1
              sigma: 1
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/x
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = validateEndpointTargets(parsed.state);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("s1:/nope"))).toBe(true);
  });

  it("accepts valid workload and downstream targets", () => {
    const parsed = parseSimulationScenarioYaml(`
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
        downstream:
          - to: s1:/y
            call_count_mean: 1
            call_latency_ms:
              mean: 1
              sigma: 1
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /y
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
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(validateWorkloadTargets(parsed.state).ok).toBe(true);
    expect(validateEndpointTargets(parsed.state).ok).toBe(true);
  });

  it("ScenarioV2 extras survive parse → serialize after endpoint and workload edits", () => {
    const first = parseSimulationScenarioYaml(SAMPLE_SCENARIO_V2_YAML);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const state = { ...first.state };
    const svc0 = state.services[0];
    if (svc0?.endpoints[0]) {
      svc0.endpoints[0] = { ...svc0.endpoints[0], mean_cpu_ms: 999 };
    }
    if (state.workload[0]) {
      state.workload[0] = {
        ...state.workload[0],
        arrival: { ...state.workload[0].arrival, rate_rps: 42 },
      };
    }
    const yaml = scenarioStateToYaml(state).trim();
    expect(yaml).toContain("mean_cpu_ms: 999");
    expect(yaml).toContain("rate_rps: 42");
    expect(yaml).toMatch(/schema_version:\s*(?:0\.2\.0|"0\.2\.0")/);
    expect(yaml).toContain("simulation_limits:");
    expect(yaml).toContain("kind: api_gateway");

    const second = parseSimulationScenarioYaml(yaml);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.services[0]?.endpoints[0]?.mean_cpu_ms).toBe(999);
    expect(second.state.workload[0]?.arrival.rate_rps).toBe(42);
    expect(endpointTargetSet(second.state).size).toBeGreaterThan(0);
    expect(validateWorkloadTargets(second.state).ok).toBe(true);
    expect(validateEndpointTargets(second.state).ok).toBe(true);
  });

  it("remapEndpointTargetKey updates workload and downstream refs when endpoint path key changes", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /a
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream:
          - to: s1:/b
            call_count_mean: 1
            call_latency_ms:
              mean: 1
              sigma: 1
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /b
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/a
    arrival:
      type: poisson
      rate_rps: 1
policies: {}
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let state = parsed.state;
    const services = [...state.services];
    const endpoints = [...services[0].endpoints];
    endpoints[0] = { ...endpoints[0], path: "/alpha" };
    services[0] = { ...services[0], endpoints };
    state = { ...state, services };
    state = remapEndpointTargetKey(state, "s1:/a", "s1:/alpha");
    expect(state.workload[0].to).toBe("s1:/alpha");
    expect(state.services[0].endpoints[0].downstream[0].to).toBe("s1:/b");
    expect(validateWorkloadTargets(state).ok).toBe(true);
    expect(validateEndpointTargets(state).ok).toBe(true);
    const yaml = scenarioStateToYaml(state);
    expect(yaml).toContain("to: s1:/alpha");
    expect(yaml).toContain("to: s1:/b");
  });

  it("patchAutoscalingServiceRows preserves autoscaling-level extras (UI-style policy edit)", () => {
    const parsed = parseSimulationScenarioYaml(`
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
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const policies = patchAutoscalingServiceRows(parsed.state.policies as ScenarioPolicies | undefined, (rows) =>
      rows.map((r, i) => (i === 0 ? { ...r, min_replicas: 2 } : r))
    );
    expect(policies.autoscaling?.extra?.enabled).toBe(true);
    expect(policies.autoscaling?.extra?.target_cpu_util).toBe(0.65);
    expect(policies.autoscaling?.services[0]?.min_replicas).toBe(2);
    const yaml = scenarioStateToYaml({ ...parsed.state, policies }).trim();
    expect(yaml).toContain("enabled: true");
    expect(yaml).toContain("min_replicas: 2");
    const round = parseSimulationScenarioYaml(yaml);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.state.policies?.autoscaling?.extra?.enabled).toBe(true);
    expect(round.state.policies?.autoscaling?.services[0]?.min_replicas).toBe(2);
  });

  it("makeDefaultEndpoint generates unique endpoint paths", () => {
    expect(makeDefaultEndpoint([]).path).toBe("/endpoint");
    expect(makeDefaultEndpoint(["/endpoint"]).path).toBe("/endpoint-2");
    expect(makeDefaultEndpoint(["/endpoint", "/endpoint-2"]).path).toBe("/endpoint-3");
  });

  it("makeDefaultDownstreamCall creates expected default call shape", () => {
    expect(makeDefaultDownstreamCall("s1:/x")).toEqual({
      to: "s1:/x",
      call_count_mean: 1,
      downstream_fraction_cpu: 0.5,
      call_latency_ms: { mean: 5, sigma: 1 },
    });
  });

  it("findEndpointReferences finds workload references", () => {
    const parsed = parseSimulationScenarioYaml(`
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
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const refs = findEndpointReferences(parsed.state, "s1", "/x");
    expect(refs.some((r) => r.kind === "workload")).toBe(true);
    expect(formatEndpointReferenceSummary(refs)).toContain("Workload pattern 1");
  });

  it("findEndpointReferences finds downstream references", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /a
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream:
          - to: s1:/b
            call_count_mean: 1
            call_latency_ms:
              mean: 1
              sigma: 1
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /b
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload: []
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const refs = findEndpointReferences(parsed.state, "s1", "/b");
    expect(refs.some((r) => r.kind === "downstream")).toBe(true);
    expect(formatEndpointReferenceSummary(refs)).toContain("Downstream call s1:/a #1");
  });

  it("findEndpointReferences returns empty list when endpoint has no references", () => {
    const parsed = parseSimulationScenarioYaml(`
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
workload: []
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const refs = findEndpointReferences(parsed.state, "s1", "/x");
    expect(refs).toEqual([]);
    expect(formatEndpointReferenceSummary(refs)).toBe("");
  });

  it("addEndpointToService appends unique endpoint and returns selected index", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /endpoint
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/endpoint
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = addEndpointToService(parsed.state, 0);
    expect(result.endpointIndex).toBe(1);
    expect(result.scenario.services[0].endpoints[1].path).toBe("/endpoint-2");
  });

  it("deleteEndpointIfUnreferenced deletes only safe endpoints", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /a
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /b
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/a
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const blocked = deleteEndpointIfUnreferenced(parsed.state, 0, 0);
    expect(blocked.deleted).toBe(false);
    expect(blocked.references.some((r) => r.kind === "workload")).toBe(true);
    const deleted = deleteEndpointIfUnreferenced(parsed.state, 0, 1);
    expect(deleted.deleted).toBe(true);
    expect(deleted.scenario.services[0].endpoints.map((e) => e.path)).toEqual(["/a"]);
  });

  it("addDownstreamCallToEndpoint adds defaults and remains target-valid", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /a
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /b
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/a
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = addDownstreamCallToEndpoint(parsed.state, 0, 0);
    const d = next.services[0].endpoints[0].downstream[0];
    expect(d).toEqual({
      to: "s1:/b",
      call_count_mean: 1,
      downstream_fraction_cpu: 0.5,
      call_latency_ms: { mean: 5, sigma: 1 },
    });
    expect(validateEndpointTargets(next).ok).toBe(true);
  });

  it("removeDownstreamCallFromEndpoint removes one row and validation still passes", () => {
    const parsed = parseSimulationScenarioYaml(`
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
      - path: /a
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream:
          - to: s1:/b
            call_count_mean: 1
            call_latency_ms:
              mean: 1
              sigma: 1
            downstream_fraction_cpu: 0.5
        net_latency_ms:
          mean: 1
          sigma: 1
      - path: /b
        mean_cpu_ms: 1
        cpu_sigma_ms: 1
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 1
          sigma: 1
workload:
  - from: client
    to: s1:/a
    arrival:
      type: poisson
      rate_rps: 1
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = removeDownstreamCallFromEndpoint(parsed.state, 0, 0, 0);
    expect(next.services[0].endpoints[0].downstream).toEqual([]);
    expect(validateWorkloadTargets(next).ok).toBe(true);
    expect(validateEndpointTargets(next).ok).toBe(true);
  });
});
