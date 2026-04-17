/**
 * Normalize persisted metric points from GET /runs/:id/metrics (nested) and
 * GET /runs/:id/metrics/timeseries (flat) for consistent chart grouping and UI.
 */

export type PersistedLabelValue = string | number | boolean;

export interface NormalizedPersistedMetricPoint {
  metric?: string;
  timestamp: string;
  value: number;
  labels: Record<string, PersistedLabelValue>;
  hostId?: string;
  instanceId?: string;
  serviceId?: string;
  nodeId?: string;
  /** Raw tags from the backend (preserved for debugging) */
  tags: Record<string, unknown>;
}

function coerceLabelValue(v: unknown): PersistedLabelValue | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return undefined;
}

function asTagRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function asLabelRecord(v: unknown): Record<string, PersistedLabelValue> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, PersistedLabelValue> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const c = coerceLabelValue(val);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

function idString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return String(v);
  return undefined;
}

/**
 * Merge primary labels with fallbacks from tags (when labels missing or empty).
 */
function buildLabels(
  rawLabels: unknown,
  tags: Record<string, unknown>
): Record<string, PersistedLabelValue> {
  let labels = asLabelRecord(rawLabels);
  if (Object.keys(labels).length === 0) {
    labels = asLabelRecord(tags);
  }
  return labels;
}

/**
 * Normalize a nested or flat persisted metric point.
 *
 * @param point raw point from the API
 * @param parentMetric metric name from the parent series (nested GET /metrics)
 */
export function normalizePersistedMetricPoint(
  point: unknown,
  parentMetric?: string
): NormalizedPersistedMetricPoint | null {
  if (!point || typeof point !== "object") return null;
  const p = point as Record<string, unknown>;

  const value =
    typeof p.value === "number" && Number.isFinite(p.value)
      ? p.value
      : typeof p.value === "string"
        ? Number(p.value)
        : NaN;
  if (!Number.isFinite(value)) return null;

  const timestamp =
    typeof p.timestamp === "string"
      ? p.timestamp
      : typeof p.time === "string"
        ? p.time
        : "";
  if (!timestamp) return null;

  const tags = asTagRecord(p.tags);
  const labels = buildLabels(p.labels, tags);

  const metric =
    typeof p.metric === "string" && p.metric.trim()
      ? p.metric
      : typeof parentMetric === "string" && parentMetric.trim()
        ? parentMetric
        : undefined;

  const hostId =
    idString(p.host_id) ??
    idString(labels.host) ??
    idString(tags.host);

  const instanceId =
    idString(p.instance_id) ??
    idString(labels.instance) ??
    idString(labels.instance_id) ??
    idString(tags.instance) ??
    idString(tags.instance_id);

  const serviceId =
    idString(p.service_id) ??
    idString(labels.service) ??
    idString(labels.service_id) ??
    idString(tags.service) ??
    idString(tags.service_id);

  const nodeId =
    idString(p.node_id) ??
    idString(labels.node) ??
    idString(labels.node_id) ??
    idString(tags.node) ??
    idString(tags.node_id);

  return {
    metric,
    timestamp,
    value,
    labels,
    hostId,
    instanceId,
    serviceId,
    nodeId,
    tags,
  };
}
