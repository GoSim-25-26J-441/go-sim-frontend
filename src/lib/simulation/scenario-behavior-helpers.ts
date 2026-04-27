import type {
  ScenarioAutoscalingServicePolicy,
  ScenarioDownstreamCall,
  ScenarioEndpoint,
  ScenarioPolicies,
  ScenarioService,
  ScenarioState,
} from "./scenario-yaml-parse";

export interface EndpointOption {
  value: string;
  label: string;
}

export interface TargetValidationResult {
  ok: boolean;
  errors: string[];
}

export interface EndpointDeleteResult {
  scenario: ScenarioState;
  deleted: boolean;
  references: EndpointReference[];
}

export type EndpointReference =
  | { kind: "workload"; label: string; workloadIndex: number }
  | {
      kind: "downstream";
      label: string;
      sourceServiceId: string;
      sourcePath: string;
      downstreamIndex: number;
    };

export function getServiceKind(service: ScenarioService): string | undefined {
  const k = service.extra?.kind;
  return typeof k === "string" && k.trim() ? k : undefined;
}

export function getServiceRole(service: ScenarioService): string | undefined {
  const r = service.extra?.role;
  return typeof r === "string" && r.trim() ? r : undefined;
}

/** Canonical `serviceId:path` keys for workload/downstream targets. */
export function getEndpointOptions(scenario: ScenarioState): EndpointOption[] {
  return scenario.services.flatMap((svc) =>
    svc.endpoints.map((ep) => ({
      value: `${svc.id}:${ep.path}`,
      label: `${svc.id}${ep.path}`,
    }))
  );
}

export function endpointTargetSet(scenario: ScenarioState): Set<string> {
  return new Set(getEndpointOptions(scenario).map((o) => o.value));
}

export function validateWorkloadTargets(scenario: ScenarioState): TargetValidationResult {
  const set = endpointTargetSet(scenario);
  const errors: string[] = [];
  scenario.workload.forEach((w, i) => {
    const to = w.to.trim();
    if (to && !set.has(to)) {
      errors.push(`Workload pattern ${i + 1}: target "${w.to}" is not an existing endpoint.`);
    }
  });
  return { ok: errors.length === 0, errors };
}

export function validateEndpointTargets(scenario: ScenarioState): TargetValidationResult {
  const set = endpointTargetSet(scenario);
  const errors: string[] = [];
  scenario.services.forEach((svc) => {
    svc.endpoints.forEach((ep) => {
      ep.downstream.forEach((d, di) => {
        const to = d.to.trim();
        if (to && !set.has(to)) {
          errors.push(
            `Downstream call on ${svc.id}${ep.path} (#${di + 1}): "${d.to}" is not an existing endpoint.`
          );
        }
      });
    });
  });
  return { ok: errors.length === 0, errors };
}

export function countEndpoints(scenario: ScenarioState): number {
  return scenario.services.reduce((n, s) => n + s.endpoints.length, 0);
}

export function makeDefaultEndpoint(existingPaths: string[] = []): ScenarioEndpoint {
  const seen = new Set(existingPaths.map((p) => p.trim()));
  let path = "/endpoint";
  if (seen.has(path)) {
    let i = 2;
    while (seen.has(`/endpoint-${i}`)) i += 1;
    path = `/endpoint-${i}`;
  }
  return {
    path,
    mean_cpu_ms: 10,
    cpu_sigma_ms: 2,
    default_memory_mb: 16,
    downstream: [],
    net_latency_ms: { mean: 5, sigma: 1 },
  };
}

export function makeDefaultDownstreamCall(target: string): ScenarioDownstreamCall {
  return {
    to: target,
    call_count_mean: 1,
    downstream_fraction_cpu: 0.5,
    call_latency_ms: { mean: 5, sigma: 1 },
  };
}

export function findEndpointReferences(
  scenario: ScenarioState,
  serviceId: string,
  path: string
): EndpointReference[] {
  const key = `${serviceId}:${path}`;
  const refs: EndpointReference[] = [];
  scenario.workload.forEach((w, wi) => {
    if (w.to.trim() === key) {
      refs.push({
        kind: "workload",
        label: `Workload pattern ${wi + 1}`,
        workloadIndex: wi,
      });
    }
  });
  scenario.services.forEach((svc) => {
    svc.endpoints.forEach((ep) => {
      ep.downstream.forEach((d, di) => {
        if (d.to.trim() === key) {
          refs.push({
            kind: "downstream",
            label: `Downstream call ${svc.id}:${ep.path} #${di + 1}`,
            sourceServiceId: svc.id,
            sourcePath: ep.path,
            downstreamIndex: di,
          });
        }
      });
    });
  });
  return refs;
}

export function formatEndpointReferenceSummary(references: EndpointReference[]): string {
  if (references.length === 0) return "";
  return references.map((r) => r.label).join("; ");
}

export function addEndpointToService(
  scenario: ScenarioState,
  serviceIndex: number
): { scenario: ScenarioState; endpointIndex: number } {
  const services = [...scenario.services];
  const service = services[serviceIndex];
  if (!service) return { scenario, endpointIndex: 0 };
  const nextEndpoint = makeDefaultEndpoint(service.endpoints.map((e) => e.path));
  const endpoints = [...service.endpoints, nextEndpoint];
  services[serviceIndex] = { ...service, endpoints };
  return { scenario: { ...scenario, services }, endpointIndex: endpoints.length - 1 };
}

export function deleteEndpointIfUnreferenced(
  scenario: ScenarioState,
  serviceIndex: number,
  endpointIndex: number
): EndpointDeleteResult {
  const service = scenario.services[serviceIndex];
  const endpoint = service?.endpoints[endpointIndex];
  if (!service || !endpoint) return { scenario, deleted: false, references: [] };
  const references = findEndpointReferences(scenario, service.id, endpoint.path.trim());
  if (references.length > 0) {
    return { scenario, deleted: false, references };
  }
  const services = [...scenario.services];
  const endpoints = service.endpoints.filter((_, i) => i !== endpointIndex);
  services[serviceIndex] = { ...service, endpoints };
  return { scenario: { ...scenario, services }, deleted: true, references: [] };
}

export function addDownstreamCallToEndpoint(
  scenario: ScenarioState,
  serviceIndex: number,
  endpointIndex: number
): ScenarioState {
  const services = [...scenario.services];
  const service = services[serviceIndex];
  const endpoint = service?.endpoints[endpointIndex];
  if (!service || !endpoint) return scenario;
  const selfKey = `${service.id}:${endpoint.path}`;
  const options = getEndpointOptions(scenario);
  const target = options.find((o) => o.value !== selfKey)?.value ?? options[0]?.value ?? "";
  if (!target) return scenario;
  const endpoints = [...service.endpoints];
  const downstream = [...endpoint.downstream, makeDefaultDownstreamCall(target)];
  endpoints[endpointIndex] = { ...endpoint, downstream };
  services[serviceIndex] = { ...service, endpoints };
  return { ...scenario, services };
}

export function removeDownstreamCallFromEndpoint(
  scenario: ScenarioState,
  serviceIndex: number,
  endpointIndex: number,
  downstreamIndex: number
): ScenarioState {
  const services = [...scenario.services];
  const service = services[serviceIndex];
  const endpoint = service?.endpoints[endpointIndex];
  if (!service || !endpoint) return scenario;
  const endpoints = [...service.endpoints];
  endpoints[endpointIndex] = {
    ...endpoint,
    downstream: endpoint.downstream.filter((_, i) => i !== downstreamIndex),
  };
  services[serviceIndex] = { ...service, endpoints };
  return { ...scenario, services };
}

/**
 * When an endpoint path changes, workload `to` and downstream `to` keys use `serviceId:path`.
 * Remap references from the old canonical key to the new one so targets stay valid.
 */
export function remapEndpointTargetKey(scenario: ScenarioState, oldKey: string, newKey: string): ScenarioState {
  if (oldKey === newKey) return scenario;
  const workload = scenario.workload.map((w) =>
    w.to.trim() === oldKey ? { ...w, to: newKey } : w
  );
  const services = scenario.services.map((svc) => ({
    ...svc,
    endpoints: svc.endpoints.map((ep) => ({
      ...ep,
      downstream: ep.downstream.map((d) =>
        d.to.trim() === oldKey ? { ...d, to: newKey } : d
      ),
    })),
  }));
  return { ...scenario, services, workload };
}

/**
 * Mutate autoscaling policy rows while preserving `policies.autoscaling` sibling keys (e.g. enabled, cooldowns).
 */
export function patchAutoscalingServiceRows(
  prevPolicies: ScenarioPolicies | undefined,
  updater: (rows: ScenarioAutoscalingServicePolicy[]) => ScenarioAutoscalingServicePolicy[]
): ScenarioPolicies {
  const policies: ScenarioPolicies = { ...(prevPolicies ?? {}) };
  const prevAs = policies.autoscaling;
  const nextRows = updater([...(prevAs?.services ?? [])]);
  policies.autoscaling = {
    ...(prevAs ?? {}),
    services: nextRows,
  };
  return policies;
}
