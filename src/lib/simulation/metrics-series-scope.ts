/**
 * Scope extraction for persisted metrics (nested GET /metrics and flat GET /metrics/timeseries).
 * Keep in sync with the simulation backend contract for labels, tags, and ID fields.
 */

export type SeriesScopeInput = {
  labels?: Record<string, string | undefined>;
  tags?: Record<string, unknown>;
  service_id?: string;
  host_id?: string;
  instance_id?: string;
  node_id?: string;
  /** Present on flat /metrics/timeseries points; omitted on nested /metrics points (metric is on the parent series). */
  metric?: string;
};

export function extractSeriesScope(p: SeriesScopeInput): string {
  const tag = (key: string) => {
    const v = p.tags?.[key];
    return typeof v === "string" ? v : undefined;
  };

  return (
    p.labels?.service ??
    p.labels?.service_id ??
    p.labels?.host ??
    p.labels?.host_id ??
    p.labels?.instance ??
    p.labels?.instance_id ??
    p.service_id ??
    p.host_id ??
    p.instance_id ??
    p.node_id ??
    tag("service") ??
    tag("service_id") ??
    tag("host") ??
    tag("host_id") ??
    tag("instance") ??
    tag("instance_id") ??
    "unscoped"
  );
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
