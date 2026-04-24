/**
 * Batch `allowed_actions`: JSON array of protobuf enum **integers** (simulationv1.BatchScalingAction).
 * Standard Go encoding/json unmarshals these as numeric ordinals. Each dimension implies both directions
 * (e.g. replica scale-in and scale-out) when the backend implements it that way.
 */
export type BatchScalingActionFlags = {
  allow_replica_scaling: boolean;
  allow_host_scaling: boolean;
  allow_service_cpu: boolean;
  allow_service_memory: boolean;
  allow_host_cpu: boolean;
  allow_host_memory: boolean;
};

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

export function allowedActionsFromFlags(flags: BatchScalingActionFlags): number[] {
  return BATCH_SCALING_CHECKBOXES.filter((row) => flags[row.key]).map((row) => row.ordinal);
}
