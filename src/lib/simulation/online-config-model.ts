import type {
  PatchRunConfigurationPolicies,
  PatchRunConfigurationService,
  PatchRunConfigurationWorkloadItem,
} from "@/lib/api-client/simulation";
import type { ClusterPlacementResources, OptimizationStepConfig } from "@/types/simulation";

export type OnlineConfigFieldGroup = "runtimeEditable" | "leaseControl" | "createTimeLocked";
export type OnlineConfigFieldMutability = "runtime_patchable" | "action_metadata" | "create_time_locked";
export type OnlineConfigFieldSource =
  | "run_metadata"
  | "optimization_step.current_config"
  | "metrics_snapshot.resources"
  | "scenario_fallback"
  | "derived_client_state";

export interface OnlineConfigActionMeta {
  endpoint: string;
  method: "PATCH" | "POST" | "PUT";
  notes?: string;
}

export interface OnlineConfigFieldModel {
  key: string;
  label: string;
  group: OnlineConfigFieldGroup;
  mutability: OnlineConfigFieldMutability;
  source: OnlineConfigFieldSource | OnlineConfigFieldSource[];
  helpText: string;
  action?: OnlineConfigActionMeta;
  observedValue?: unknown;
  observedValues?: string[];
}

export interface OnlineConfigModel {
  fields: OnlineConfigFieldModel[];
  byGroup: Record<OnlineConfigFieldGroup, OnlineConfigFieldModel[]>;
}

export interface OnlineConfigModelInputs {
  runMetadata?: Record<string, unknown> | null;
  latestOptimizationConfig?: OptimizationStepConfig | null;
  latestResources?: ClusterPlacementResources | null;
  scenarioServiceIds?: string[];
  scenarioWorkloadPatternKeys?: string[];
  leaseState?: {
    autoRenewEnabled?: boolean;
    lastRenewalStatus?: "ok" | "error" | "idle";
    lastRenewalError?: string | null;
    nextRenewalAtMs?: number | null;
  };
}

const RUNTIME_EDITABLE_FIELDS: OnlineConfigFieldModel[] = [
  {
    key: "services[].id",
    label: "Service ID",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: [
      "optimization_step.current_config",
      "metrics_snapshot.resources",
      "scenario_fallback",
    ],
    helpText: "Service identifier for runtime service patches.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
      notes: "Service patch rows should include replicas even for cpu/memory-only changes.",
    },
  },
  {
    key: "services[].replicas",
    label: "Replicas",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Horizontal scale for a service in online runs.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
      notes: "Required in service patch payloads.",
    },
  },
  {
    key: "services[].cpu_cores",
    label: "Service CPU Cores",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Per-service CPU allocation.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
      notes: "Include replicas in the same service patch row.",
    },
  },
  {
    key: "services[].memory_mb",
    label: "Service Memory (MB)",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Per-service memory allocation in MB.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
      notes: "Include replicas in the same service patch row.",
    },
  },
  {
    key: "workload[].pattern_key",
    label: "Workload Pattern",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: ["optimization_step.current_config", "scenario_fallback"],
    helpText: "Workload pattern key for runtime rate updates.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/workload",
      method: "PATCH",
      notes: "Single-pattern updates use /workload, multi-pattern updates use /configuration.",
    },
  },
  {
    key: "workload[].rate_rps",
    label: "Workload Rate (RPS)",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Runtime request rate per workload pattern.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/workload",
      method: "PATCH",
      notes: "Single-pattern updates use /workload, multi-pattern updates use /configuration.",
    },
  },
  {
    key: "policies.autoscaling.enabled",
    label: "Autoscaling Enabled",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Enable or disable autoscaling policy at runtime.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
    },
  },
  {
    key: "policies.autoscaling.target_cpu_util",
    label: "Autoscaling Target CPU Utilization",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Target CPU utilization used by autoscaling policy.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
    },
  },
  {
    key: "policies.autoscaling.scale_step",
    label: "Autoscaling Scale Step",
    group: "runtimeEditable",
    mutability: "runtime_patchable",
    source: "optimization_step.current_config",
    helpText: "Replica increment/decrement step for autoscaling.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/configuration",
      method: "PATCH",
    },
  },
];

const LEASE_CONTROL_FIELDS: OnlineConfigFieldModel[] = [
  {
    key: "lease_ttl_ms",
    label: "Lease TTL (ms)",
    group: "leaseControl",
    mutability: "action_metadata",
    source: "run_metadata",
    helpText: "Lease time-to-live configured at run creation; used for renewal cadence.",
  },
  {
    key: "lease.auto_renew_enabled",
    label: "Auto Renew Enabled",
    group: "leaseControl",
    mutability: "action_metadata",
    source: "derived_client_state",
    helpText: "Whether client-side lease renewal loop is active.",
  },
  {
    key: "lease.last_renewal_status",
    label: "Last Renewal Status",
    group: "leaseControl",
    mutability: "action_metadata",
    source: "derived_client_state",
    helpText: "Most recent renew lease attempt status tracked by the dashboard.",
  },
  {
    key: "lease.next_renewal_at_ms",
    label: "Next Renewal Time",
    group: "leaseControl",
    mutability: "action_metadata",
    source: "derived_client_state",
    helpText: "Planned next renewal timestamp when available.",
  },
  {
    key: "actions.renew_online_lease",
    label: "Renew Online Lease Action",
    group: "leaseControl",
    mutability: "action_metadata",
    source: "derived_client_state",
    helpText: "Action metadata for online lease renewal; behavior unchanged.",
    action: {
      endpoint: "/api/v1/simulation/runs/:id/online/renew-lease",
      method: "POST",
      notes: "Metadata only in phase 1 model.",
    },
  },
];

const CREATE_TIME_LOCKED_KEYS: Array<{ key: string; label: string; helpText: string }> = [
  { key: "real_time_mode", label: "Real-time Mode", helpText: "Run mode selected at creation time." },
  { key: "optimization.online", label: "Online Optimization Enabled", helpText: "Creation-time optimization mode flag." },
  { key: "optimization_target_primary", label: "Optimization Target Primary", helpText: "Primary optimization objective for online controller." },
  { key: "target_p95_latency_ms", label: "Target P95 Latency (ms)", helpText: "Controller latency objective configured at creation." },
  { key: "control_interval_ms", label: "Control Interval (ms)", helpText: "Controller loop interval configured at creation." },
  { key: "min_hosts", label: "Minimum Hosts", helpText: "Minimum host count bound configured at creation." },
  { key: "max_hosts", label: "Maximum Hosts", helpText: "Maximum host count bound configured at creation." },
  { key: "scale_down_cpu_util_max", label: "Scale-down CPU Util Max", helpText: "Scale-down guardrail threshold configured at creation." },
  { key: "scale_down_mem_util_max", label: "Scale-down Memory Util Max", helpText: "Scale-down guardrail threshold configured at creation." },
  { key: "target_util_high", label: "Target Utilization High", helpText: "Upper utilization band configured at creation." },
  { key: "target_util_low", label: "Target Utilization Low", helpText: "Lower utilization band configured at creation." },
  { key: "scale_down_host_cpu_util_max", label: "Scale-down Host CPU Util Max", helpText: "Host-level scale-down guardrail configured at creation." },
  { key: "max_controller_steps", label: "Max Controller Steps", helpText: "Controller step budget configured at creation." },
  { key: "max_online_duration_ms", label: "Max Online Duration (ms)", helpText: "Maximum online run duration configured at creation." },
  { key: "allow_unbounded_online", label: "Allow Unbounded Online", helpText: "Whether online duration may exceed default bounds." },
  { key: "max_noop_intervals", label: "Max No-op Intervals", helpText: "No-op interval guard configured at creation." },
  { key: "lease_ttl_ms", label: "Lease TTL (ms)", helpText: "Lease duration configured at creation." },
  { key: "scale_down_cooldown_ms", label: "Scale-down Cooldown (ms)", helpText: "Cooldown between scale-down actions." },
  { key: "host_drain_timeout_ms", label: "Host Drain Timeout (ms)", helpText: "Host drain timeout configured at creation." },
  { key: "memory_headroom_mb", label: "Memory Headroom (MB)", helpText: "Memory guardrail headroom configured at creation." },
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function fromOptimizationServiceIds(cfg?: OptimizationStepConfig | null): string[] {
  if (!cfg?.services) return [];
  return cfg.services.map((s) => asString(s.id)).filter((v): v is string => Boolean(v));
}

function fromResourceServiceIds(resources?: ClusterPlacementResources | null): string[] {
  if (!resources?.services) return [];
  return resources.services
    .map((s) => asString(s.service_id))
    .filter((v): v is string => Boolean(v));
}

function fromOptimizationWorkloadPatternKeys(cfg?: OptimizationStepConfig | null): string[] {
  if (!Array.isArray(cfg?.workload)) return [];
  return cfg.workload
    .map((w) => asRecord(w))
    .map((w) => (w ? asString(w.pattern_key) : undefined))
    .filter((v): v is string => Boolean(v));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function getNestedValue(root: Record<string, unknown> | undefined, keyPath: string): unknown {
  if (!root) return undefined;
  if (keyPath in root) return root[keyPath];
  const parts = keyPath.split(".");
  let current: unknown = root;
  for (const p of parts) {
    const rec = asRecord(current);
    if (!rec || !(p in rec)) return undefined;
    current = rec[p];
  }
  return current;
}

function createTimeLockedFields(
  metadata?: Record<string, unknown> | null,
  cfg?: OptimizationStepConfig | null
): OnlineConfigFieldModel[] {
  const meta = metadata ?? undefined;
  const out: OnlineConfigFieldModel[] = CREATE_TIME_LOCKED_KEYS.map((item) => ({
    key: item.key,
    label: item.label,
    group: "createTimeLocked" as const,
    mutability: "create_time_locked" as const,
    source: "run_metadata",
    helpText: item.helpText,
    observedValue: getNestedValue(meta, item.key),
  }));

  const topologyGuardrailExtras = new Set<string>();
  for (const source of [meta, cfg as Record<string, unknown> | undefined]) {
    if (!source) continue;
    for (const k of Object.keys(source)) {
      if (/(topology|locality|zone|guardrail|min_locality|cross_zone)/i.test(k)) {
        topologyGuardrailExtras.add(k);
      }
    }
  }
  for (const key of Array.from(topologyGuardrailExtras).sort((a, b) => a.localeCompare(b))) {
    if (CREATE_TIME_LOCKED_KEYS.some((x) => x.key === key)) continue;
    out.push({
      key,
      label: `Topology/Locality Guardrail: ${key}`,
      group: "createTimeLocked",
      mutability: "create_time_locked",
      source: ["run_metadata", "optimization_step.current_config"] as OnlineConfigFieldSource[],
      helpText: "Additional topology/locality guardrail surfaced from observed run metadata/config.",
      observedValue: getNestedValue(meta, key) ?? getNestedValue(cfg as Record<string, unknown> | undefined, key),
    });
  }
  return out;
}

export function buildOnlineConfigModel(inputs: OnlineConfigModelInputs): OnlineConfigModel {
  const metadata = inputs.runMetadata ?? undefined;
  const latestCfg = inputs.latestOptimizationConfig ?? undefined;
  const serviceIds = uniqueSorted([
    ...fromOptimizationServiceIds(latestCfg),
    ...fromResourceServiceIds(inputs.latestResources),
    ...(inputs.scenarioServiceIds ?? []),
  ]);
  const workloadPatternKeys = uniqueSorted([
    ...fromOptimizationWorkloadPatternKeys(latestCfg),
    ...(inputs.scenarioWorkloadPatternKeys ?? []),
  ]);
  const autoscaling = asRecord(latestCfg?.policies)?.autoscaling as PatchRunConfigurationPolicies["autoscaling"] | undefined;

  const runtimeFields = RUNTIME_EDITABLE_FIELDS.map((f) => {
    if (f.key === "services[].id") return { ...f, observedValues: serviceIds };
    if (f.key === "workload[].pattern_key") return { ...f, observedValues: workloadPatternKeys };
    if (f.key === "policies.autoscaling.enabled")
      return { ...f, observedValue: autoscaling?.enabled };
    if (f.key === "policies.autoscaling.target_cpu_util")
      return { ...f, observedValue: autoscaling?.target_cpu_util };
    if (f.key === "policies.autoscaling.scale_step")
      return { ...f, observedValue: autoscaling?.scale_step };
    return f;
  });

  const leaseFields = LEASE_CONTROL_FIELDS.map((f) => {
    if (f.key === "lease_ttl_ms") return { ...f, observedValue: getNestedValue(metadata, "lease_ttl_ms") };
    if (f.key === "lease.auto_renew_enabled") return { ...f, observedValue: inputs.leaseState?.autoRenewEnabled };
    if (f.key === "lease.last_renewal_status")
      return {
        ...f,
        observedValue:
          inputs.leaseState?.lastRenewalStatus ??
          (inputs.leaseState?.lastRenewalError ? "error" : undefined),
      };
    if (f.key === "lease.next_renewal_at_ms") return { ...f, observedValue: inputs.leaseState?.nextRenewalAtMs };
    return f;
  });

  const createLockedFields = createTimeLockedFields(metadata, latestCfg);
  const fields = [...runtimeFields, ...leaseFields, ...createLockedFields];
  return {
    fields,
    byGroup: {
      runtimeEditable: fields.filter((f) => f.group === "runtimeEditable"),
      leaseControl: fields.filter((f) => f.group === "leaseControl"),
      createTimeLocked: fields.filter((f) => f.group === "createTimeLocked"),
    },
  };
}

export type OnlineRuntimeEditableServiceField = keyof PatchRunConfigurationService;
export type OnlineRuntimeEditableWorkloadField = keyof PatchRunConfigurationWorkloadItem;
