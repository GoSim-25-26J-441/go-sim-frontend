/**
 * Batch `allowed_actions`: JSON array of protobuf enum values for simulation `BatchScalingAction`.
 * This repo sends **numeric ordinals** (1–6) as historically consumed by Go `encoding/json`.
 * Some gateways accept protobuf JSON enum **names** instead (e.g. `BATCH_SCALING_ACTION_SCALE_REPLICAS`);
 * confirm against your simulation-core / BFF contract before switching formats.
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
