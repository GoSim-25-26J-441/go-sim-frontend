import type {
  DetectionKind,
  NodeKind,
  Severity,
} from "@/app/features/amg-apd/types";

export const NODE_KIND_COLOR: Record<NodeKind, string> = {
  SERVICE: "#e5f0ff", // light blue
  DATABASE: "#fef9c3", // light yellow
};

export const DETECTION_KIND_COLOR: Record<DetectionKind, string> = {
  cycles: "#e11d48", // rose-600
  god_service: "#a855f7", // purple-500
  tight_coupling: "#f97316", // orange-500
  shared_db_writes: "#ef4444", // red-500
  cross_db_read: "#06b6d4", // cyan-500
  chatty_calls: "#f59e0b", // amber-500
};

export function severityAlpha(sev: Severity = "MEDIUM") {
  return sev === "HIGH" ? 0.95 : sev === "MEDIUM" ? 0.75 : 0.45;
}
