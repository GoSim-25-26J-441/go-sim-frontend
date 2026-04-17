/**
 * Parse simulation-core scenario YAML into the structured editor shape used on the new simulation page,
 * and serialize back with unknown keys preserved (passthrough) so backend-owned fields are not dropped.
 */
import { parse as parseYaml, stringify } from "yaml";

export type ArrivalType = "poisson" | "uniform" | "normal" | "bursty" | "constant";

export interface ScenarioHost {
  id: string;
  cores: number;
  memory_gb?: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioDownstreamCallLatency {
  mean: number;
  sigma: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioDownstreamCall {
  to: string;
  call_count_mean: number;
  call_latency_ms: ScenarioDownstreamCallLatency;
  downstream_fraction_cpu: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioNetLatency {
  mean: number;
  sigma: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioEndpoint {
  path: string;
  mean_cpu_ms: number;
  cpu_sigma_ms: number;
  default_memory_mb?: number;
  downstream: ScenarioDownstreamCall[];
  net_latency_ms: ScenarioNetLatency;
  extra?: Record<string, unknown>;
}

export interface ScenarioService {
  id: string;
  replicas: number;
  model: string;
  cpu_cores?: number;
  memory_mb?: number;
  endpoints: ScenarioEndpoint[];
  extra?: Record<string, unknown>;
}

export interface ScenarioArrival {
  type: ArrivalType;
  rate_rps: number;
  stddev_rps?: number;
  burst_rate_rps?: number;
  burst_duration_seconds?: number;
  quiet_duration_seconds?: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioWorkloadPattern {
  from: string;
  to: string;
  arrival: ScenarioArrival;
  extra?: Record<string, unknown>;
}

export interface ScenarioAutoscalingServicePolicy {
  service_id: string;
  min_replicas: number;
  max_replicas: number;
  target_p95_latency_ms: number;
  target_cpu_utilization: number;
  scale_up_step: number;
  scale_down_step: number;
  extra?: Record<string, unknown>;
}

export interface ScenarioAutoscalingPolicies {
  services: ScenarioAutoscalingServicePolicy[];
  /** Sibling keys under `policies.autoscaling` not modeled explicitly (e.g. enabled, cooldowns). */
  extra?: Record<string, unknown>;
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
  /** Top-level YAML keys not modeled explicitly (e.g. version, extensions). */
  extra?: Record<string, unknown>;
}

const ROOT_KNOWN = new Set(["hosts", "services", "workload", "policies"]);

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

function partitionExtra(
  obj: Record<string, unknown>,
  known: Set<string>
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) extra[k] = v;
  }
  return extra;
}

function emitExtraLines(extra: Record<string, unknown> | undefined, baseIndent: number): string[] {
  if (!extra || Object.keys(extra).length === 0) return [];
  const pad = " ".repeat(baseIndent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue;
    const chunk = stringify({ [k]: v }, { lineWidth: 0 }).trimEnd();
    for (const line of chunk.split("\n")) {
      lines.push(pad + line);
    }
  }
  return lines;
}

const ARRIVAL_TYPES: readonly ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

function parseArrival(raw: unknown): ScenarioArrival {
  const a = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const t = str(a.type, "poisson");
  const type: ArrivalType = ARRIVAL_TYPES.includes(t as ArrivalType) ? (t as ArrivalType) : "poisson";
  const known = new Set([
    "type",
    "rate_rps",
    "stddev_rps",
    "burst_rate_rps",
    "burst_duration_seconds",
    "quiet_duration_seconds",
  ]);
  const extra = partitionExtra(a, known);
  return {
    type,
    rate_rps: num(a.rate_rps, 0),
    stddev_rps: a.stddev_rps !== undefined ? num(a.stddev_rps, 0) : undefined,
    burst_rate_rps: a.burst_rate_rps !== undefined ? num(a.burst_rate_rps, 0) : undefined,
    burst_duration_seconds:
      a.burst_duration_seconds !== undefined ? num(a.burst_duration_seconds, 0) : undefined,
    quiet_duration_seconds:
      a.quiet_duration_seconds !== undefined ? num(a.quiet_duration_seconds, 0) : undefined,
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

function parseDownstream(raw: unknown): ScenarioDownstreamCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const d = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const lat = d.call_latency_ms;
    const latObj =
      typeof lat === "object" && lat !== null ? (lat as Record<string, unknown>) : {};
    const latKnown = new Set(["mean", "sigma"]);
    const latExtra = partitionExtra(latObj, latKnown);
    const itemKnown = new Set([
      "to",
      "call_count_mean",
      "call_latency_ms",
      "downstream_fraction_cpu",
    ]);
    const itemExtra = partitionExtra(d, itemKnown);
    return {
      to: str(d.to, ""),
      call_count_mean: num(d.call_count_mean, 1),
      call_latency_ms: {
        mean: num(latObj.mean, 5),
        sigma: num(latObj.sigma, 1),
        ...(Object.keys(latExtra).length ? { extra: latExtra } : {}),
      },
      downstream_fraction_cpu: num(d.downstream_fraction_cpu, 0.5),
      ...(Object.keys(itemExtra).length ? { extra: itemExtra } : {}),
    };
  });
}

function parseEndpoint(raw: unknown): ScenarioEndpoint | null {
  const e = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!e) return null;
  const net = e.net_latency_ms;
  const netObj = typeof net === "object" && net !== null ? (net as Record<string, unknown>) : {};
  const netKnown = new Set(["mean", "sigma"]);
  const netExtra = partitionExtra(netObj, netKnown);
  const epKnown = new Set([
    "path",
    "mean_cpu_ms",
    "cpu_sigma_ms",
    "default_memory_mb",
    "downstream",
    "net_latency_ms",
  ]);
  const epExtra = partitionExtra(e, epKnown);
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
      ...(Object.keys(netExtra).length ? { extra: netExtra } : {}),
    },
    ...(Object.keys(epExtra).length ? { extra: epExtra } : {}),
  };
}

function parseService(raw: unknown): ScenarioService | null {
  const s = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!s) return null;
  const endpointsRaw = s.endpoints;
  const endpoints: ScenarioEndpoint[] = Array.isArray(endpointsRaw)
    ? endpointsRaw.map(parseEndpoint).filter((x): x is ScenarioEndpoint => x != null)
    : [];
  const svcKnown = new Set(["id", "replicas", "model", "cpu_cores", "memory_mb", "endpoints"]);
  const extra = partitionExtra(s, svcKnown);
  return {
    id: str(s.id, "svc1"),
    replicas: Math.max(1, Math.floor(num(s.replicas, 1))),
    model: str(s.model, "cpu"),
    cpu_cores: s.cpu_cores !== undefined ? num(s.cpu_cores, 1) : undefined,
    memory_mb: s.memory_mb !== undefined ? num(s.memory_mb, 512) : undefined,
    endpoints,
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

function parseWorkload(raw: unknown): ScenarioWorkloadPattern[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const w = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const wKnown = new Set(["from", "to", "arrival"]);
    const wExtra = partitionExtra(w, wKnown);
    return {
      from: str(w.from, "client"),
      to: str(w.to, "svc1:/test"),
      arrival: parseArrival(w.arrival),
      ...(Object.keys(wExtra).length ? { extra: wExtra } : {}),
    };
  });
}

function parseAutoscalingPolicyRow(raw: unknown): ScenarioAutoscalingServicePolicy {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const known = new Set([
    "service_id",
    "min_replicas",
    "max_replicas",
    "target_p95_latency_ms",
    "target_cpu_utilization",
    "scale_up_step",
    "scale_down_step",
  ]);
  const extra = partitionExtra(r, known);
  return {
    service_id: str(r.service_id, ""),
    min_replicas: Math.max(0, Math.floor(num(r.min_replicas, 1))),
    max_replicas: Math.max(0, Math.floor(num(r.max_replicas, 1))),
    target_p95_latency_ms: num(r.target_p95_latency_ms, 0),
    target_cpu_utilization: num(r.target_cpu_utilization, 0),
    scale_up_step: num(r.scale_up_step, 1),
    scale_down_step: num(r.scale_down_step, 1),
    ...(Object.keys(extra).length ? { extra } : {}),
  };
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
    const asKnown = new Set(["services"]);
    const asExtra = partitionExtra(as, asKnown);
    const servicesRaw = as.services;
    const services: ScenarioAutoscalingServicePolicy[] = Array.isArray(servicesRaw)
      ? servicesRaw.map(parseAutoscalingPolicyRow)
      : [];
    const autoscalingState: ScenarioAutoscalingPolicies = {
      services,
      ...(Object.keys(asExtra).length ? { extra: asExtra } : {}),
    };
    return { ...p, autoscaling: autoscalingState };
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
        const hostKnown = new Set(["id", "cores", "memory_gb"]);
        const extra = partitionExtra(o, hostKnown);
        return {
          id: str(o.id, "host-1"),
          cores: Math.max(1, Math.floor(num(o.cores, 1))),
          memory_gb: mem !== undefined && mem !== null && String(mem) !== "" ? num(mem, 0) : undefined,
          ...(Object.keys(extra).length ? { extra } : {}),
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

    const rootExtra = partitionExtra(root, ROOT_KNOWN);

    return {
      ok: true,
      state: {
        hosts,
        services,
        workload,
        ...(policies ? { policies } : {}),
        ...(Object.keys(rootExtra).length ? { extra: rootExtra } : {}),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid YAML.";
    return { ok: false, error: msg };
  }
}

/** Serialize editor scenario state to YAML (inverse of parseSimulationScenarioYaml for known + passthrough fields). */
export function scenarioStateToYaml(scenario: ScenarioState): string {
  const lines: string[] = [];

  lines.push("hosts:");
  if (scenario.hosts.length === 0) {
    lines.push("  []");
  } else {
    for (const host of scenario.hosts) {
      lines.push(`  - id: ${host.id || "host-1"}`);
      lines.push(`    cores: ${host.cores || 1}`);
      if (host.memory_gb != null && host.memory_gb > 0) {
        lines.push(`    memory_gb: ${host.memory_gb}`);
      }
      lines.push(...emitExtraLines(host.extra, 4));
    }
  }

  lines.push("", "services:");
  if (scenario.services.length === 0) {
    lines.push("  []");
  } else {
    for (const svc of scenario.services) {
      lines.push(`  - id: ${svc.id || "svc1"}`);
      lines.push(`    replicas: ${svc.replicas || 1}`);
      lines.push(`    model: ${svc.model || "cpu"}`);

      const cpuCores = svc.cpu_cores && svc.cpu_cores > 0 ? svc.cpu_cores : 1.0;
      const memoryMb = svc.memory_mb && svc.memory_mb > 0 ? svc.memory_mb : 512.0;
      lines.push(`    cpu_cores: ${cpuCores}`);
      lines.push(`    memory_mb: ${memoryMb}`);
      lines.push(...emitExtraLines(svc.extra, 4));

      lines.push("    endpoints:");
      if (svc.endpoints.length === 0) {
        lines.push("      []");
      } else {
        for (const ep of svc.endpoints) {
          lines.push(`      - path: ${ep.path}`);
          lines.push(`        mean_cpu_ms: ${ep.mean_cpu_ms}`);
          lines.push(`        cpu_sigma_ms: ${ep.cpu_sigma_ms}`);
          const defaultMem = ep.default_memory_mb && ep.default_memory_mb > 0 ? ep.default_memory_mb : 10.0;
          lines.push(`        default_memory_mb: ${defaultMem}`);
          lines.push(...emitExtraLines(ep.extra, 8));

          lines.push("        downstream:");
          if (!ep.downstream || ep.downstream.length === 0) {
            lines.push("          []");
          } else {
            for (const d of ep.downstream) {
              lines.push(`          - to: ${d.to}`);
              lines.push(`            call_count_mean: ${d.call_count_mean}`);
              lines.push("            call_latency_ms:");
              lines.push(`              mean: ${d.call_latency_ms.mean}`);
              lines.push(`              sigma: ${d.call_latency_ms.sigma}`);
              lines.push(...emitExtraLines(d.call_latency_ms.extra, 14));
              lines.push(`            downstream_fraction_cpu: ${d.downstream_fraction_cpu}`);
              lines.push(...emitExtraLines(d.extra, 12));
            }
          }

          lines.push("        net_latency_ms:");
          lines.push(`          mean: ${ep.net_latency_ms.mean}`);
          lines.push(`          sigma: ${ep.net_latency_ms.sigma}`);
          lines.push(...emitExtraLines(ep.net_latency_ms.extra, 10));
        }
      }
    }
  }

  lines.push("", "workload:");
  if (scenario.workload.length === 0) {
    lines.push("  []");
  } else {
    for (const w of scenario.workload) {
      lines.push(`  - from: ${w.from || "client"}`);
      lines.push(`    to: ${w.to || "svc1:/test"}`);
      lines.push(...emitExtraLines(w.extra, 4));
      lines.push("    arrival:");
      lines.push(`      type: ${w.arrival.type}`);
      lines.push(`      rate_rps: ${w.arrival.rate_rps ?? 0}`);

      if (w.arrival.type === "normal") {
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
      } else if (w.arrival.type === "bursty") {
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(`      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`);
        lines.push(`      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`);
      } else {
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(`      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`);
        lines.push(`      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`);
      }
      lines.push(...emitExtraLines(w.arrival.extra, 6));
    }
  }

  lines.push("", "policies:");
  const pol = scenario.policies;
  if (!pol || Object.keys(pol).length === 0) {
    lines.push("  {}");
  } else {
    const polRec = pol as Record<string, unknown>;
    const asc = pol.autoscaling as ScenarioAutoscalingPolicies | undefined;
    const policyKeys = Object.keys(polRec).filter((k) => polRec[k] !== undefined);
    const nonAutoscalingKeys = policyKeys.filter((k) => k !== "autoscaling");

    const hasAutoscalingBlock = Boolean(asc);

    if (!hasAutoscalingBlock && nonAutoscalingKeys.length === 0) {
      lines.push("  {}");
    } else {
      if (hasAutoscalingBlock && asc) {
        lines.push("  autoscaling:");
        lines.push("    services:");
        if (asc.services.length === 0) {
          lines.push("      []");
        } else {
          for (const svcPol of asc.services) {
            lines.push("      - service_id: " + (svcPol.service_id || "service"));
            lines.push("        min_replicas: " + (svcPol.min_replicas ?? 1));
            lines.push("        max_replicas: " + (svcPol.max_replicas ?? 1));
            lines.push("        target_p95_latency_ms: " + (svcPol.target_p95_latency_ms ?? 0));
            lines.push("        target_cpu_utilization: " + (svcPol.target_cpu_utilization ?? 0));
            lines.push("        scale_up_step: " + (svcPol.scale_up_step ?? 1));
            lines.push("        scale_down_step: " + (svcPol.scale_down_step ?? 1));
            lines.push(...emitExtraLines(svcPol.extra, 8));
          }
        }
        lines.push(...emitExtraLines(asc.extra, 4));
      }
      for (const k of nonAutoscalingKeys) {
        const v = polRec[k];
        if (v === undefined) continue;
        const chunk = stringify({ [k]: v }, { lineWidth: 0 }).trimEnd();
        for (const line of chunk.split("\n")) {
          lines.push("  " + line);
        }
      }
    }
  }

  if (scenario.extra && Object.keys(scenario.extra).length > 0) {
    lines.push(...emitExtraLines(scenario.extra, 0));
  }

  return lines.join("\n");
}
