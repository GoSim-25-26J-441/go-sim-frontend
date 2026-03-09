import { parse as parseYaml } from "yaml";

/** AMG-APD template: one service entry from the diagram YAML */
export interface AmgApdService {
  name: string;
  type: string;
}

/** AMG-APD template: one dependency (from -> to) */
export interface AmgApdDependency {
  from: string;
  to: string;
  kind?: string;
  sync?: boolean;
}

/** AMG-APD template: parsed shape from version yaml_content */
export interface AmgApdTemplate {
  services: AmgApdService[];
  dependencies: AmgApdDependency[];
  datastores?: unknown[];
}

/** Output type compatible with ScenarioState in page.tsx */
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
  type: "poisson" | "uniform" | "normal" | "bursty" | "constant";
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

export interface ScenarioState {
  hosts: ScenarioHost[];
  services: ScenarioService[];
  workload: ScenarioWorkloadPattern[];
}

const DEFAULT_ARRIVAL: ScenarioArrival = {
  type: "poisson",
  rate_rps: 10,
};

function isAmgApdService(x: unknown): x is AmgApdService {
  return (
    typeof x === "object" &&
    x !== null &&
    "name" in x &&
    typeof (x as AmgApdService).name === "string" &&
    "type" in x &&
    typeof (x as AmgApdService).type === "string"
  );
}

function isAmgApdDependency(x: unknown): x is AmgApdDependency {
  return (
    typeof x === "object" &&
    x !== null &&
    "from" in x &&
    typeof (x as AmgApdDependency).from === "string" &&
    "to" in x &&
    typeof (x as AmgApdDependency).to === "string"
  );
}

/**
 * Parse AMG-APD diagram YAML template (services, dependencies, datastores).
 * Returns null on parse error or invalid structure (e.g. empty services).
 */
export function parseAmgApdTemplate(yamlString: string): AmgApdTemplate | null {
  try {
    const raw = parseYaml(yamlString);
    if (typeof raw !== "object" || raw === null) return null;

    const servicesRaw: unknown[] = Array.isArray((raw as Record<string, unknown>).services)
      ? ((raw as Record<string, unknown>).services as unknown[])
      : [];
    const services: AmgApdService[] = servicesRaw.filter(isAmgApdService);
    if (services.length === 0) return null;

    const depsRaw: unknown[] = Array.isArray((raw as Record<string, unknown>).dependencies)
      ? ((raw as Record<string, unknown>).dependencies as unknown[])
      : [];
    const dependencies: AmgApdDependency[] = depsRaw.filter(isAmgApdDependency);

    const datastores: unknown[] | undefined = Array.isArray((raw as Record<string, unknown>).datastores)
      ? ((raw as Record<string, unknown>).datastores as unknown[])
      : undefined;

    return { services, dependencies, datastores };
  } catch {
    return null;
  }
}

/** Normalize service name to a valid id (used as service id and in workload to) */
function toServiceId(name: string): string {
  return name.trim() || "svc";
}

/** Set of service names (from template.services) for quick lookup */
function serviceNameSet(template: AmgApdTemplate): Set<string> {
  const set = new Set<string>();
  for (const s of template.services) set.add(s.name.trim());
  return set;
}

/**
 * Convert AMG-APD template to ScenarioState (one host, services with one endpoint each,
 * downstream from dependencies, one workload entry inferred from dependencies).
 */
export function amgApdTemplateToScenarioState(template: AmgApdTemplate): ScenarioState {
  const serviceNames = serviceNameSet(template);
  const defaultNetLatency: ScenarioNetLatency = { mean: 5, sigma: 1 };
  const defaultDownstreamCall: ScenarioDownstreamCall = {
    to: "",
    call_count_mean: 1,
    call_latency_ms: { mean: 5, sigma: 1 },
    downstream_fraction_cpu: 0.5,
  };

  const hosts: ScenarioHost[] = [{ id: "host-1", cores: 4, memory_gb: 16 }];

  const services: ScenarioService[] = template.services.map((svc) => {
    const id = toServiceId(svc.name);
    const downstreamFromDeps = template.dependencies
      .filter((d) => d.from.trim() === svc.name.trim() && serviceNames.has(d.to.trim()))
      .map((d) => ({
        ...defaultDownstreamCall,
        to: toServiceId(d.to),
      }));
    return {
      id,
      replicas: 1,
      model: "cpu",
      cpu_cores: 1,
      memory_mb: 512,
      endpoints: [
        {
          path: "/",
          mean_cpu_ms: 10,
          cpu_sigma_ms: 2,
          default_memory_mb: 16,
          downstream: downstreamFromDeps,
          net_latency_ms: defaultNetLatency,
        },
      ],
    };
  });

  // Workload: prefer a node that looks like a client (only source in deps), then first dependency
  const targetsByFrom = new Map<string, string[]>();
  for (const d of template.dependencies) {
    const from = d.from.trim();
    const to = d.to.trim();
    if (!serviceNames.has(from) || !serviceNames.has(to)) continue;
    const list = targetsByFrom.get(from) ?? [];
    list.push(to);
    targetsByFrom.set(from, list);
  }
  const allTargets = new Set(template.dependencies.map((d) => d.to.trim()));
  const entryCandidates = template.services
    .map((s) => s.name.trim())
    .filter((name) => !allTargets.has(name));
  const clientLike = entryCandidates.find((n) => /client/i.test(n)) ?? entryCandidates[0];
  const firstDep = template.dependencies.find(
    (d) => serviceNames.has(d.from) && serviceNames.has(d.to)
  );

  let workloadFrom = "client";
  let workloadTo = "svc1:/";

  if (clientLike && targetsByFrom.get(clientLike)?.length) {
    workloadFrom = clientLike;
    workloadTo = `${toServiceId(targetsByFrom.get(clientLike)![0])}:/`;
  } else if (firstDep) {
    workloadFrom = firstDep.from.trim();
    workloadTo = `${toServiceId(firstDep.to)}:/`;
  } else if (services.length > 0) {
    workloadTo = `${services[0].id}:/`;
  }

  const workload: ScenarioWorkloadPattern[] = [
    {
      from: workloadFrom,
      to: workloadTo,
      arrival: DEFAULT_ARRIVAL,
    },
  ];

  return { hosts, services, workload };
}
