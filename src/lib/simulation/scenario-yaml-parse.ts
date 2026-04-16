/**
 * Parse simulation-core scenario YAML into the structured editor shape used on the new simulation page.
 * Inverse of scenarioToYaml in the simulation new page (same schema).
 */
import { parse as parseYaml } from "yaml";

export type ArrivalType = "poisson" | "uniform" | "normal" | "bursty" | "constant";

export interface ScenarioHost {
  id: string;
  cores: number;
  memory_gb?: number;
}

export interface ScenarioDownstreamCallLatency {
  mean: number;
  sigma: number;
}

export interface ScenarioDownstreamCall {
  to: string;
  call_count_mean: number;
  call_latency_ms: ScenarioDownstreamCallLatency;
  downstream_fraction_cpu: number;
}

export interface ScenarioNetLatency {
  mean: number;
  sigma: number;
}

export interface ScenarioEndpoint {
  path: string;
  mean_cpu_ms: number;
  cpu_sigma_ms: number;
  default_memory_mb?: number;
  downstream: ScenarioDownstreamCall[];
  net_latency_ms: ScenarioNetLatency;
}

export interface ScenarioService {
  id: string;
  replicas: number;
  model: string;
  cpu_cores?: number;
  memory_mb?: number;
  endpoints: ScenarioEndpoint[];
}

export interface ScenarioArrival {
  type: ArrivalType;
  rate_rps: number;
  stddev_rps?: number;
  burst_rate_rps?: number;
  burst_duration_seconds?: number;
  quiet_duration_seconds?: number;
}

export interface ScenarioWorkloadPattern {
  from: string;
  to: string;
  arrival: ScenarioArrival;
}

export interface ScenarioAutoscalingServicePolicy {
  service_id: string;
  min_replicas: number;
  max_replicas: number;
  target_p95_latency_ms: number;
  target_cpu_utilization: number;
  scale_up_step: number;
  scale_down_step: number;
}

export interface ScenarioAutoscalingPolicies {
  services: ScenarioAutoscalingServicePolicy[];
}

export interface ScenarioPolicies {
  autoscaling?: ScenarioAutoscalingPolicies;
  [key: string]: unknown;
}

export interface ScenarioState {
  hosts: ScenarioHost[];
  services: ScenarioService[];
  workload: ScenarioWorkloadPattern[];
  policies?: ScenarioPolicies;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const ARRIVAL_TYPES: readonly ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

function parseArrival(raw: unknown): ScenarioArrival {
  const a = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const t = str(a.type, "poisson");
  const type: ArrivalType = ARRIVAL_TYPES.includes(t as ArrivalType) ? (t as ArrivalType) : "poisson";
  return {
    type,
    rate_rps: num(a.rate_rps, 0),
    stddev_rps: a.stddev_rps !== undefined ? num(a.stddev_rps, 0) : undefined,
    burst_rate_rps: a.burst_rate_rps !== undefined ? num(a.burst_rate_rps, 0) : undefined,
    burst_duration_seconds:
      a.burst_duration_seconds !== undefined ? num(a.burst_duration_seconds, 0) : undefined,
    quiet_duration_seconds:
      a.quiet_duration_seconds !== undefined ? num(a.quiet_duration_seconds, 0) : undefined,
  };
}

function parseDownstream(raw: unknown): ScenarioDownstreamCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const d = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const lat = d.call_latency_ms;
    const latObj =
      typeof lat === "object" && lat !== null ? (lat as Record<string, unknown>) : {};
    return {
      to: str(d.to, ""),
      call_count_mean: num(d.call_count_mean, 1),
      call_latency_ms: {
        mean: num(latObj.mean, 5),
        sigma: num(latObj.sigma, 1),
      },
      downstream_fraction_cpu: num(d.downstream_fraction_cpu, 0.5),
    };
  });
}

function parseEndpoint(raw: unknown): ScenarioEndpoint | null {
  const e = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!e) return null;
  const net = e.net_latency_ms;
  const netObj = typeof net === "object" && net !== null ? (net as Record<string, unknown>) : {};
  return {
    path: str(e.path, "/"),
    mean_cpu_ms: num(e.mean_cpu_ms, 10),
    cpu_sigma_ms: num(e.cpu_sigma_ms, 2),
    default_memory_mb:
      e.default_memory_mb !== undefined ? num(e.default_memory_mb, 16) : undefined,
    downstream: parseDownstream(e.downstream),
    net_latency_ms: {
      mean: num(netObj.mean, 5),
      sigma: num(netObj.sigma, 1),
    },
  };
}

function parseService(raw: unknown): ScenarioService | null {
  const s = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!s) return null;
  const endpointsRaw = s.endpoints;
  const endpoints: ScenarioEndpoint[] = Array.isArray(endpointsRaw)
    ? endpointsRaw.map(parseEndpoint).filter((x): x is ScenarioEndpoint => x != null)
    : [];
  return {
    id: str(s.id, "svc1"),
    replicas: Math.max(1, Math.floor(num(s.replicas, 1))),
    model: str(s.model, "cpu"),
    cpu_cores: s.cpu_cores !== undefined ? num(s.cpu_cores, 1) : undefined,
    memory_mb: s.memory_mb !== undefined ? num(s.memory_mb, 512) : undefined,
    endpoints,
  };
}

function parseWorkload(raw: unknown): ScenarioWorkloadPattern[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const w = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    return {
      from: str(w.from, "client"),
      to: str(w.to, "svc1:/test"),
      arrival: parseArrival(w.arrival),
    };
  });
}

function parsePolicies(raw: unknown): ScenarioPolicies | undefined {
  if (raw == null || raw === false) return undefined;
  if (typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length === 0) return undefined;
  const autoscaling = p.autoscaling;
  if (typeof autoscaling === "object" && autoscaling !== null) {
    const as = autoscaling as Record<string, unknown>;
    const servicesRaw = as.services;
    if (Array.isArray(servicesRaw)) {
      const services: ScenarioAutoscalingServicePolicy[] = servicesRaw.map((row) => {
        const r = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
        return {
          service_id: str(r.service_id, ""),
          min_replicas: Math.max(0, Math.floor(num(r.min_replicas, 1))),
          max_replicas: Math.max(0, Math.floor(num(r.max_replicas, 1))),
          target_p95_latency_ms: num(r.target_p95_latency_ms, 0),
          target_cpu_utilization: num(r.target_cpu_utilization, 0),
          scale_up_step: num(r.scale_up_step, 1),
          scale_down_step: num(r.scale_down_step, 1),
        };
      });
      return { ...p, autoscaling: { services } };
    }
  }
  return { ...p } as ScenarioPolicies;
}

export function parseSimulationScenarioYaml(
  yamlString: string
): { ok: true; state: ScenarioState } | { ok: false; error: string } {
  try {
    const doc = parseYaml(yamlString);
    if (typeof doc !== "object" || doc === null) {
      return { ok: false, error: "Scenario YAML must be a mapping at the root." };
    }
    const root = doc as Record<string, unknown>;

    const hostsRaw = root.hosts;
    let hosts: ScenarioHost[] = [];
    if (Array.isArray(hostsRaw)) {
      hosts = hostsRaw.map((h) => {
        const o = typeof h === "object" && h !== null ? (h as Record<string, unknown>) : {};
        const mem = o.memory_gb;
        return {
          id: str(o.id, "host-1"),
          cores: Math.max(1, Math.floor(num(o.cores, 1))),
          memory_gb: mem !== undefined && mem !== null && String(mem) !== "" ? num(mem, 0) : undefined,
        };
      });
    }

    const servicesRaw = root.services;
    let services: ScenarioService[] = [];
    if (Array.isArray(servicesRaw)) {
      services = servicesRaw.map(parseService).filter((x): x is ScenarioService => x != null);
    }

    const workload = parseWorkload(root.workload);

    const policies = parsePolicies(root.policies);

    return {
      ok: true,
      state: {
        hosts,
        services,
        workload,
        ...(policies ? { policies } : {}),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid YAML.";
    return { ok: false, error: msg };
  }
}
