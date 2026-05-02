/**
 * Resolve backend-owned final_config for placement UI: prefer GET /metrics summary
 * when the backend persists it there; fall back to run metadata for older runs.
 */

export type PlacementPersistenceStatus =
  | "reported"
  | "empty"
  | "unavailable"
  /** `final_config` exists but has no `placements` field */
  | "no_placement_key";

export function resolveFinalConfigForPlacement(
  metricsSummary: { final_config?: unknown } | undefined,
  runMetadataFinalConfig: unknown
): unknown {
  const fromMetrics = metricsSummary?.final_config;
  if (fromMetrics != null && typeof fromMetrics === "object" && !Array.isArray(fromMetrics)) {
    const keys = Object.keys(fromMetrics as object);
    if (keys.length > 0) return fromMetrics;
  }
  return runMetadataFinalConfig;
}

export function placementStatusFromFinalConfig(input: unknown): PlacementPersistenceStatus {
  const r = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!r) return "unavailable";
  if (!Object.prototype.hasOwnProperty.call(r, "placements")) {
    return Object.keys(r).length > 0 ? "no_placement_key" : "unavailable";
  }
  const raw = r.placements;
  if (!Array.isArray(raw)) return "unavailable";
  return raw.length > 0 ? "reported" : "empty";
}
