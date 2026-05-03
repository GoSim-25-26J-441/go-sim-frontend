/**
 * Batch `allowed_actions`: JSON array of protobuf enum **ordinals** for simulation `BatchScalingAction`.
 * The backend contract today is six coarse, bidirectional dimensions (1–6). Each ordinal enables both
 * “up/down” or “in/out” directions for that dimension; finer directional control requires future proto/API support.
 *
 * The UI models **directional** toggles; we fold them into these coarse ordinals for serialization
 * (OR across each pair). See `coarseFlagsFromDirectional` and tests.
 */
export type BatchScalingActionFlags = {
  allow_replica_scaling: boolean;
  allow_host_scaling: boolean;
  allow_service_cpu: boolean;
  allow_service_memory: boolean;
  allow_host_cpu: boolean;
  allow_host_memory: boolean;
};

/** Fine-grained UI; serialized by folding into {@link BatchScalingActionFlags} / ordinals 1–6. */
export type DirectionalBatchScalingFlags = {
  service_scale_out: boolean;
  service_scale_in: boolean;
  host_scale_out: boolean;
  host_scale_in: boolean;
  service_cpu_up: boolean;
  service_cpu_down: boolean;
  service_memory_up: boolean;
  service_memory_down: boolean;
  host_cpu_up: boolean;
  host_cpu_down: boolean;
  host_memory_up: boolean;
  host_memory_down: boolean;
};

export type BatchActionPresetId =
  | "all_actions"
  | "service_only"
  | "host_only"
  | "service_plus_host"
  | "broker_concurrency"
  | "custom";

/** Queue/topic/broker scalars are not yet encoded as separate `allowed_actions` ordinals — keep presets honest. */
export const BATCH_BROKER_ACTIONS_READY = false;

export const BATCH_SCALING_CHECKBOXES: {
  key: keyof BatchScalingActionFlags;
  ordinal: number;
  label: string;
}[] = [
  { key: "allow_replica_scaling", ordinal: 1, label: "Allow replica scaling" },
  { key: "allow_host_scaling", ordinal: 2, label: "Allow host scaling" },
  { key: "allow_service_cpu", ordinal: 3, label: "Allow service CPU changes" },
  { key: "allow_service_memory", ordinal: 4, label: "Allow service memory changes" },
  { key: "allow_host_cpu", ordinal: 5, label: "Allow host CPU changes" },
  { key: "allow_host_memory", ordinal: 6, label: "Allow host memory changes" },
];

export function coarseFlagsFromDirectional(d: DirectionalBatchScalingFlags): BatchScalingActionFlags {
  return {
    allow_replica_scaling: d.service_scale_out || d.service_scale_in,
    allow_host_scaling: d.host_scale_out || d.host_scale_in,
    allow_service_cpu: d.service_cpu_up || d.service_cpu_down,
    allow_service_memory: d.service_memory_up || d.service_memory_down,
    allow_host_cpu: d.host_cpu_up || d.host_cpu_down,
    allow_host_memory: d.host_memory_up || d.host_memory_down,
  };
}

export function allowedActionsFromFlags(flags: BatchScalingActionFlags): number[] {
  return BATCH_SCALING_CHECKBOXES.filter((row) => flags[row.key]).map((row) => row.ordinal);
}

/** Serializes directional UI state to the same coarse ordinal array the backend expects. */
export function allowedActionsFromDirectional(d: DirectionalBatchScalingFlags): number[] {
  return allowedActionsFromFlags(coarseFlagsFromDirectional(d));
}

const ALL_TRUE: DirectionalBatchScalingFlags = {
  service_scale_out: true,
  service_scale_in: true,
  host_scale_out: true,
  host_scale_in: true,
  service_cpu_up: true,
  service_cpu_down: true,
  service_memory_up: true,
  service_memory_down: true,
  host_cpu_up: true,
  host_cpu_down: true,
  host_memory_up: true,
  host_memory_down: true,
};

const SERVICE_ONLY: DirectionalBatchScalingFlags = {
  service_scale_out: true,
  service_scale_in: true,
  host_scale_out: false,
  host_scale_in: false,
  service_cpu_up: true,
  service_cpu_down: true,
  service_memory_up: true,
  service_memory_down: true,
  host_cpu_up: false,
  host_cpu_down: false,
  host_memory_up: false,
  host_memory_down: false,
};

const HOST_ONLY: DirectionalBatchScalingFlags = {
  service_scale_out: false,
  service_scale_in: false,
  host_scale_out: true,
  host_scale_in: true,
  service_cpu_up: false,
  service_cpu_down: false,
  service_memory_up: false,
  service_memory_down: false,
  host_cpu_up: true,
  host_cpu_down: true,
  host_memory_up: true,
  host_memory_down: true,
};

/** With current backend, “all actions” equals service+host fleet dimensions (no broker ordinals yet). */
export function directionalFlagsForPreset(preset: Exclude<BatchActionPresetId, "custom">): DirectionalBatchScalingFlags {
  switch (preset) {
    case "all_actions":
      return { ...ALL_TRUE };
    case "service_only":
      return { ...SERVICE_ONLY };
    case "host_only":
      return { ...HOST_ONLY };
    case "service_plus_host":
      return { ...ALL_TRUE };
    case "broker_concurrency":
      return { ...ALL_TRUE };
    default:
      return { ...ALL_TRUE };
  }
}

export function cloneDirectional(d: DirectionalBatchScalingFlags): DirectionalBatchScalingFlags {
  return { ...d };
}

export function hostActionsEnabled(d: DirectionalBatchScalingFlags): boolean {
  return (
    d.host_scale_out ||
    d.host_scale_in ||
    d.host_cpu_up ||
    d.host_cpu_down ||
    d.host_memory_up ||
    d.host_memory_down
  );
}
