/**
 * Scope extraction for persisted metrics (nested GET /metrics and flat GET /metrics/timeseries).
 * Keep in sync with the simulation backend contract for labels, tags, and ID fields.
 */

import type { NormalizedPersistedMetricPoint } from "./normalize-persisted-metric-point";

export type SeriesScopeInput = {
  labels?: Record<string, string | number | boolean | undefined>;
  tags?: Record<string, unknown>;
  service_id?: string;
  host_id?: string;
  instance_id?: string;
  node_id?: string;
  /** Present on flat /metrics/timeseries points; omitted on nested /metrics points (metric is on the parent series). */
  metric?: string;
  /** Optional camelCase aliases (normalized persisted points). */
  serviceId?: string;
  hostId?: string;
  instanceId?: string;
  nodeId?: string;
};

export function extractSeriesScope(p: SeriesScopeInput): string {
  const id = (v: unknown): string | undefined => {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return undefined;
  };
  const tag = (key: string) => {
    const v = p.tags?.[key];
    return id(v);
  };

  return (
    id(p.serviceId) ??
    id(p.labels?.service) ??
    id(p.labels?.service_id) ??
    id(p.labels?.host) ??
    id(p.labels?.host_id) ??
    id(p.labels?.instance) ??
    id(p.labels?.instance_id) ??
    id(p.service_id) ??
    id(p.hostId) ??
    id(p.host_id) ??
    id(p.instanceId) ??
    id(p.instance_id) ??
    id(p.nodeId) ??
    id(p.node_id) ??
    tag("service") ??
    tag("service_id") ??
    tag("host") ??
    tag("host_id") ??
    tag("instance") ??
    tag("instance_id") ??
    "unscoped"
  );
}

function id(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function scopeValueForLabel(p: SeriesScopeInput, label: string): string | undefined {
  const key = label.trim();
  if (!key) return undefined;

  if (key === "broker" || key === "broker_service") {
    return (
      id(p.labels?.broker) ??
      id(p.labels?.broker_service) ??
      id(p.tags?.broker) ??
      id(p.tags?.broker_service)
    );
  }

  const labelVal = id(p.labels?.[key]);
  if (labelVal) return labelVal;
  const tagVal = id(p.tags?.[key]);
  if (tagVal) return tagVal;

  // Common alias handling for existing IDs and convenience names.
  if (key === "service") return id(p.serviceId) ?? id(p.service_id) ?? id(p.labels?.service_id) ?? id(p.tags?.service_id);
  if (key === "host") return id(p.hostId) ?? id(p.host_id) ?? id(p.labels?.host_id) ?? id(p.tags?.host_id);
  if (key === "instance") return id(p.instanceId) ?? id(p.instance_id) ?? id(p.labels?.instance_id) ?? id(p.tags?.instance_id);
  if (key === "node") return id(p.nodeId) ?? id(p.node_id) ?? id(p.labels?.node_id) ?? id(p.tags?.node_id);
  return undefined;
}

export function extractSeriesScopeByLabel(p: SeriesScopeInput, groupingLabel?: string): string {
  if (groupingLabel && groupingLabel !== "auto") {
    const scoped = scopeValueForLabel(p, groupingLabel);
    return scoped ?? "unscoped";
  }
  return extractSeriesScope(p);
}

function labelsForScope(n: NormalizedPersistedMetricPoint): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(n.labels)) {
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

/** Use after {@link normalizePersistedMetricPoint} so grouping matches legacy `extractSeriesScope` priority. */
export function extractSeriesScopeFromNormalized(n: NormalizedPersistedMetricPoint): string {
  return extractSeriesScope({
    labels: labelsForScope(n),
    tags: n.tags,
    serviceId: n.serviceId,
    hostId: n.hostId,
    instanceId: n.instanceId,
    nodeId: n.nodeId,
  });
}

export function extractSeriesScopeByLabelFromNormalized(
  n: NormalizedPersistedMetricPoint,
  groupingLabel?: string
): string {
  return extractSeriesScopeByLabel(
    {
      labels: labelsForScope(n),
      tags: n.tags,
      serviceId: n.serviceId,
      hostId: n.hostId,
      instanceId: n.instanceId,
      nodeId: n.nodeId,
    },
    groupingLabel
  );
}

export function flatTimeseriesSeriesKeyFromNormalized(
  n: NormalizedPersistedMetricPoint,
  fallbackMetric?: string
): string {
  const metric = n.metric ?? fallbackMetric;
  const scope = extractSeriesScopeFromNormalized(n);
  return metric ? `${metric}:${scope}` : scope;
}

/**
 * Flat /metrics/timeseries: when the response mixes multiple metrics, include `metric` in the key
 * so e.g. cpu_utilization vs memory_utilization on the same host do not collide.
 */
export function flatTimeseriesSeriesKey(p: SeriesScopeInput & { metric?: string }): string {
  const scope = extractSeriesScope(p);
  return p.metric ? `${p.metric}:${scope}` : scope;
}

export function isUnscopedSeriesKey(key: string): boolean {
  return key === "unscoped" || key.endsWith(":unscoped");
}

/**
 * Display label for flat timeseries chart legend/tooltip. Does not change the series `dataKey`
 * (`flatTimeseriesSeriesKey`). When the row metric matches the API query metric, only the scope
 * is shown (avoids `cpu_utilization:host-1` when the chart is already filtered to one metric).
 */
export function flatTimeseriesLegendLabel(dataKey: string, contextMetric?: string): string {
  const i = dataKey.indexOf(":");
  if (i <= 0) return dataKey;
  const metric = dataKey.slice(0, i);
  const scope = dataKey.slice(i + 1);
  if (contextMetric && metric === contextMetric) return scope;
  return `${metric} · ${scope}`;
}
