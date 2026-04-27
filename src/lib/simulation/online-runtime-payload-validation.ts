import type {
  PatchRunConfigurationPolicies,
  PatchRunConfigurationService,
  PatchRunConfigurationWorkloadItem,
} from "@/lib/api-client/simulation";

export interface RuntimeServiceDraft {
  id?: string;
  replicas?: number;
  cpu_cores?: number;
  memory_mb?: number;
}

type ValidationOk<T> = { ok: true; value: T };
type ValidationErr = { ok: false; error: string };
type ValidationResult<T> = ValidationOk<T> | ValidationErr;

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asPositiveNumberOrUndefined(v: unknown): number | undefined {
  return isFiniteNumber(v) && v > 0 ? v : undefined;
}

function normalizeInteger(value: number): number {
  return Math.trunc(value);
}

export function normalizeAutoscalingTargetCpuToFraction(value: number | undefined): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  if (value <= 0) return undefined;
  // Accept percent-style values from UI (70) and convert to fraction (0.7).
  if (value > 1) return value / 100;
  return value;
}

export function validateAndBuildServicePatchRows(
  rows: RuntimeServiceDraft[],
  replicasByServiceId: Record<string, number | undefined>
): ValidationResult<PatchRunConfigurationService[]> {
  const output: PatchRunConfigurationService[] = [];
  for (const row of rows) {
    const id = asNonEmptyString(row.id);
    if (!id) {
      return { ok: false, error: "Service ID is required for every row. Remove empty rows or pick a service from the dropdown." };
    }

    const derivedReplicas = isFiniteNumber(replicasByServiceId[id]) ? replicasByServiceId[id] : undefined;
    const rawReplicas = isFiniteNumber(row.replicas) ? row.replicas : derivedReplicas;
    if (!isFiniteNumber(rawReplicas)) {
      return { ok: false, error: `Replicas are required for service '${id}'. Set replicas or wait for current config to load.` };
    }
    const replicas = normalizeInteger(rawReplicas);
    if (replicas < 1) {
      return { ok: false, error: `Replicas for service '${id}' must be >= 1.` };
    }

    const cpu = row.cpu_cores;
    if (cpu != null && (!isFiniteNumber(cpu) || cpu <= 0)) {
      return { ok: false, error: `cpu_cores for service '${id}' must be > 0 when supplied.` };
    }
    const memory = row.memory_mb;
    if (memory != null && (!isFiniteNumber(memory) || memory <= 0)) {
      return { ok: false, error: `memory_mb for service '${id}' must be > 0 when supplied.` };
    }

    output.push({
      id,
      replicas,
      cpu_cores: asPositiveNumberOrUndefined(cpu),
      memory_mb: asPositiveNumberOrUndefined(memory),
    });
  }
  return { ok: true, value: output };
}

export function validateWorkloadPatchRows(
  rows: PatchRunConfigurationWorkloadItem[]
): ValidationResult<PatchRunConfigurationWorkloadItem[]> {
  const output: PatchRunConfigurationWorkloadItem[] = [];
  for (const row of rows) {
    const pattern_key = asNonEmptyString(row.pattern_key);
    if (!pattern_key) {
      return { ok: false, error: "Workload pattern key is required for every row. Pick a pattern from the dropdown." };
    }
    if (!isFiniteNumber(row.rate_rps) || row.rate_rps <= 0) {
      return { ok: false, error: `rate_rps for pattern '${pattern_key}' must be > 0.` };
    }
    output.push({ pattern_key, rate_rps: row.rate_rps });
  }
  return { ok: true, value: output };
}

export function validateAndNormalizePoliciesForPatch(
  policies: PatchRunConfigurationPolicies
): ValidationResult<PatchRunConfigurationPolicies> {
  const autoscaling = policies.autoscaling;
  if (!autoscaling) return { ok: true, value: policies };

  const normalizedTarget = normalizeAutoscalingTargetCpuToFraction(autoscaling.target_cpu_util);
  if (autoscaling.target_cpu_util != null && normalizedTarget == null) {
    return { ok: false, error: "autoscaling.target_cpu_util must be > 0." };
  }
  if (normalizedTarget != null && (normalizedTarget <= 0 || normalizedTarget > 1)) {
    return { ok: false, error: "autoscaling.target_cpu_util must map to a 0-1 fraction in payload." };
  }

  if (autoscaling.scale_step != null && (!isFiniteNumber(autoscaling.scale_step) || autoscaling.scale_step < 1)) {
    return { ok: false, error: "autoscaling.scale_step must be >= 1." };
  }

  return {
    ok: true,
    value: {
      autoscaling: {
        enabled: Boolean(autoscaling.enabled),
        target_cpu_util: normalizedTarget,
        scale_step:
          autoscaling.scale_step != null
            ? normalizeInteger(autoscaling.scale_step)
            : undefined,
      },
    },
  };
}

