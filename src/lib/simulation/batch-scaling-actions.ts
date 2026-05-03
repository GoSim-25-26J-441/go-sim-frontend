/**
 * Batch `allowed_actions`: JSON array of integer ordinals only (no enum name strings).
 * Contract aligned with backend `batch_scaling_actions` (service 1–6, host 7–12).
 *
 * Service memory: ordinal 5 = increase, 6 = decrease (per backend / product contract).
 * Queue/topic concurrency ordinals 13–16 are not enabled in the UI until `BATCH_BROKER_ACTIONS_READY`.
 */

export const BATCH_BROKER_ACTIONS_READY = false;

export type BatchActionOrdinal = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** One boolean per backend ordinal (1–12). */
export type DirectionalBatchScalingFlags = {
  service_replica_scale_up: boolean;
  service_replica_scale_down: boolean;
  service_cpu_increase: boolean;
  service_cpu_decrease: boolean;
  service_memory_increase: boolean;
  service_memory_decrease: boolean;
  host_scale_out: boolean;
  host_scale_in: boolean;
  host_cpu_increase: boolean;
  host_cpu_decrease: boolean;
  host_memory_increase: boolean;
  host_memory_decrease: boolean;
};

export type BatchActionPresetId =
  | "service_only"
  | "host_only"
  | "service_plus_host"
  | "all_actions"
  | "replica_focus"
  | "broker_concurrency"
  | "custom";

export type BatchActionRow = {
  ordinal: BatchActionOrdinal;
  key: keyof DirectionalBatchScalingFlags;
  backendNormalizedName: string;
  label: string;
};

/** Single source of truth: ordinals 1–12 in backend order. */
export const BATCH_BACKEND_ACTION_ORDER: BatchActionRow[] = [
  {
    ordinal: 1,
    key: "service_replica_scale_up",
    backendNormalizedName: "SERVICE_REPLICA_SCALE_UP",
    label: "Service replica scale up",
  },
  {
    ordinal: 2,
    key: "service_replica_scale_down",
    backendNormalizedName: "SERVICE_REPLICA_SCALE_DOWN",
    label: "Service replica scale down",
  },
  {
    ordinal: 3,
    key: "service_cpu_increase",
    backendNormalizedName: "SERVICE_CPU_INCREASE",
    label: "Service CPU increase",
  },
  {
    ordinal: 4,
    key: "service_cpu_decrease",
    backendNormalizedName: "SERVICE_CPU_DECREASE",
    label: "Service CPU decrease",
  },
  {
    ordinal: 5,
    key: "service_memory_increase",
    backendNormalizedName: "SERVICE_MEMORY_INCREASE",
    label: "Service memory increase",
  },
  {
    ordinal: 6,
    key: "service_memory_decrease",
    backendNormalizedName: "SERVICE_MEMORY_DECREASE",
    label: "Service memory decrease",
  },
  {
    ordinal: 7,
    key: "host_scale_out",
    backendNormalizedName: "HOST_SCALE_OUT",
    label: "Host scale out",
  },
  {
    ordinal: 8,
    key: "host_scale_in",
    backendNormalizedName: "HOST_SCALE_IN",
    label: "Host scale in",
  },
  {
    ordinal: 9,
    key: "host_cpu_increase",
    backendNormalizedName: "HOST_CPU_INCREASE",
    label: "Host CPU increase",
  },
  {
    ordinal: 10,
    key: "host_cpu_decrease",
    backendNormalizedName: "HOST_CPU_DECREASE",
    label: "Host CPU decrease",
  },
  {
    ordinal: 11,
    key: "host_memory_increase",
    backendNormalizedName: "HOST_MEMORY_INCREASE",
    label: "Host memory increase",
  },
  {
    ordinal: 12,
    key: "host_memory_decrease",
    backendNormalizedName: "HOST_MEMORY_DECREASE",
    label: "Host memory decrease",
  },
];

export const BATCH_SERVICE_ACTION_ORDER: BatchActionRow[] = BATCH_BACKEND_ACTION_ORDER.slice(0, 6);
export const BATCH_HOST_ACTION_ORDER: BatchActionRow[] = BATCH_BACKEND_ACTION_ORDER.slice(6, 12);

export const BATCH_BACKEND_ACTION_NAME_BY_ORDINAL: Record<number, string> = Object.fromEntries(
  BATCH_BACKEND_ACTION_ORDER.map((r) => [r.ordinal, r.backendNormalizedName])
);

const HOST_KEYS: (keyof DirectionalBatchScalingFlags)[] = BATCH_HOST_ACTION_ORDER.map((r) => r.key);

/** True if any host ordinal (7–12) is enabled — used with host fleet / host utilization warnings. */
export function anyHostScalingActionSelected(d: DirectionalBatchScalingFlags): boolean {
  return HOST_KEYS.some((k) => d[k]);
}

export function allowedActionsFromDirectional(d: DirectionalBatchScalingFlags): number[] {
  const out: number[] = [];
  for (const row of BATCH_BACKEND_ACTION_ORDER) {
    if (d[row.key]) out.push(row.ordinal);
  }
  return out;
}

function allTwelveOn(): DirectionalBatchScalingFlags {
  return {
    service_replica_scale_up: true,
    service_replica_scale_down: true,
    service_cpu_increase: true,
    service_cpu_decrease: true,
    service_memory_increase: true,
    service_memory_decrease: true,
    host_scale_out: true,
    host_scale_in: true,
    host_cpu_increase: true,
    host_cpu_decrease: true,
    host_memory_increase: true,
    host_memory_decrease: true,
  };
}

function allTwelveOff(): DirectionalBatchScalingFlags {
  return {
    service_replica_scale_up: false,
    service_replica_scale_down: false,
    service_cpu_increase: false,
    service_cpu_decrease: false,
    service_memory_increase: false,
    service_memory_decrease: false,
    host_scale_out: false,
    host_scale_in: false,
    host_cpu_increase: false,
    host_cpu_decrease: false,
    host_memory_increase: false,
    host_memory_decrease: false,
  };
}

function serviceOnlyFlags(): DirectionalBatchScalingFlags {
  return { ...allTwelveOff(), ...allServiceSliceOn() };
}

function allServiceSliceOn(): Pick<
  DirectionalBatchScalingFlags,
  | "service_replica_scale_up"
  | "service_replica_scale_down"
  | "service_cpu_increase"
  | "service_cpu_decrease"
  | "service_memory_increase"
  | "service_memory_decrease"
> {
  return {
    service_replica_scale_up: true,
    service_replica_scale_down: true,
    service_cpu_increase: true,
    service_cpu_decrease: true,
    service_memory_increase: true,
    service_memory_decrease: true,
  };
}

function hostOnlyFlags(): DirectionalBatchScalingFlags {
  return {
    ...allTwelveOff(),
    host_scale_out: true,
    host_scale_in: true,
    host_cpu_increase: true,
    host_cpu_decrease: true,
    host_memory_increase: true,
    host_memory_decrease: true,
  };
}

function replicaFocusOnly(): DirectionalBatchScalingFlags {
  return {
    ...allTwelveOff(),
    service_replica_scale_up: true,
    service_replica_scale_down: true,
  };
}

/**
 * Presets for ordinals 1–12. `all_actions` matches `service_plus_host` until broker ordinals 13–16 exist.
 * `broker_concurrency` uses the same enabled set when broker actions are not ready (no queue/topic ordinals).
 */
export function directionalFlagsForPreset(preset: Exclude<BatchActionPresetId, "custom">): DirectionalBatchScalingFlags {
  switch (preset) {
    case "service_only":
      return { ...serviceOnlyFlags() };
    case "host_only":
      return { ...hostOnlyFlags() };
    case "service_plus_host":
    case "all_actions":
      return { ...allTwelveOn() };
    case "replica_focus":
      return { ...replicaFocusOnly() };
    case "broker_concurrency":
      // Ordinals 13–16 not modeled in the form yet; preset stays aligned with 1–12 until broker ships.
      return { ...allTwelveOn() };
    default:
      return { ...allTwelveOn() };
  }
}

export function cloneDirectional(d: DirectionalBatchScalingFlags): DirectionalBatchScalingFlags {
  return { ...d };
}
