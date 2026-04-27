import type {
  ScenarioAutoscalingServicePolicy,
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
