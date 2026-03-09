/**
 * Web Worker: process timeseries data (build chart rows, downsample) off the main thread.
 * Used by the simulation run page when GET /metrics or GET /metrics/timeseries return large payloads.
 */

const MAX_POINTS = 1000;

type ChartRow = Record<string, number>;

interface MetricPoint {
  time: string;
  value: number;
  service_id?: string;
}

interface MetricTimeseries {
  metric: string;
  points: MetricPoint[];
}

interface MetricsResponse {
  run_id: string;
  timeseries?: MetricTimeseries[];
  [key: string]: unknown;
}

interface TimeseriesPoint {
  timestamp: string;
  value: number;
  labels?: { service?: string };
}

function downsampleRows(rows: ChartRow[]): ChartRow[] {
  if (rows.length <= MAX_POINTS) return rows;
  const result: ChartRow[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    const idx = Math.floor((i * (rows.length - 1)) / (MAX_POINTS - 1));
    result.push(rows[idx]);
  }
  return result;
}

function processOneTimeseries(ts: MetricTimeseries): { metric: string; rows: ChartRow[] } {
  const rowMap: Record<string, ChartRow> = {};
  for (const p of ts.points) {
    const key = p.time;
    if (!rowMap[key]) rowMap[key] = { _t: new Date(p.time).getTime() };
    rowMap[key][p.service_id ?? "global"] = p.value;
  }
  const rows = Object.values(rowMap).sort((a, b) => a._t - b._t);
  return { metric: ts.metric, rows: downsampleRows(rows) };
}

function processMetrics(data: MetricsResponse): { type: "metricsResult"; timeseriesProcessed: { metric: string; rows: ChartRow[] }[] } {
  const timeseries = data.timeseries ?? [];
  const timeseriesProcessed = timeseries.map(processOneTimeseries);
  return { type: "metricsResult", timeseriesProcessed };
}

function processTimeseriesPoints(points: TimeseriesPoint[]): { type: "timeseriesResult"; rows: ChartRow[] } {
  const rowMap: Record<number, ChartRow> = {};
  for (const p of points) {
    const t = typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : Number(p.timestamp);
    if (!rowMap[t]) rowMap[t] = { _t: t };
    const service = p.labels?.service ?? "global";
    rowMap[t][service] = p.value;
  }
  const rows = Object.values(rowMap).sort((a, b) => a._t - b._t);
  return { type: "timeseriesResult", rows: downsampleRows(rows) };
}

self.onmessage = (e: MessageEvent<{ type: string; data?: MetricsResponse; points?: TimeseriesPoint[] }>) => {
  try {
    const msg = e.data;
    if (msg.type === "processMetrics" && msg.data) {
      self.postMessage(processMetrics(msg.data));
    } else if (msg.type === "processTimeseriesPoints" && Array.isArray(msg.points)) {
      self.postMessage(processTimeseriesPoints(msg.points));
    }
  } catch (err) {
    self.postMessage({ type: "error", error: String(err) });
  }
};
