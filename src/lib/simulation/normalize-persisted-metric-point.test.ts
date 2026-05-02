import { describe, expect, it } from "vitest";
import { normalizePersistedMetricPoint } from "./normalize-persisted-metric-point";
import { extractSeriesScopeFromNormalized, flatTimeseriesSeriesKeyFromNormalized } from "./metrics-series-scope";

describe("normalizePersistedMetricPoint", () => {
  it("uses labels.host and preserves tags", () => {
    const n = normalizePersistedMetricPoint(
      {
        time: "2025-01-01T00:00:00Z",
        value: 0.5,
        labels: { host: "host-1" },
        tags: { extra: "x" },
      },
      "cpu_utilization",
    );
    expect(n).not.toBeNull();
    expect(n!.hostId).toBe("host-1");
    expect(n!.labels.host).toBe("host-1");
    expect(n!.tags.extra).toBe("x");
    expect(n!.metric).toBe("cpu_utilization");
  });

  it("derives labels from tags when labels missing", () => {
    const n = normalizePersistedMetricPoint(
      {
        time: "2025-01-01T00:00:00Z",
        value: 1,
        tags: { host: "h2" },
      },
      "m",
    );
    expect(n!.labels.host).toBe("h2");
    expect(n!.hostId).toBe("h2");
  });

  it("uses host_id when present, without requiring host-* prefixes", () => {
    const n = normalizePersistedMetricPoint(
      {
        time: "2025-01-01T00:00:00Z",
        value: 1,
        host_id: "edge-a",
        labels: {},
        tags: {},
      },
      "cpu_utilization",
    );
    expect(n!.hostId).toBe("edge-a");
  });

  it("uses service_id and instance_id", () => {
    const n = normalizePersistedMetricPoint(
      {
        time: "2025-01-01T00:00:00Z",
        value: 2,
        service_id: "svc-a",
        instance_id: "inst-1",
      },
      "cpu_utilization",
    );
    expect(n!.serviceId).toBe("svc-a");
    expect(n!.instanceId).toBe("inst-1");
  });

  it("handles no labels/tags (unscoped scope)", () => {
    const n = normalizePersistedMetricPoint(
      { time: "2025-01-01T00:00:00Z", value: 3 },
      "cpu_utilization",
    );
    expect(n).not.toBeNull();
    expect(extractSeriesScopeFromNormalized(n!)).toBe("unscoped");
  });

  it("flat endpoint: timestamp + metric on point", () => {
    const n = normalizePersistedMetricPoint({
      timestamp: "2025-01-01T00:00:01Z",
      metric: "cpu_utilization",
      value: 0.42,
      host_id: "host-1",
    });
    expect(n!.timestamp).toBe("2025-01-01T00:00:01Z");
    expect(flatTimeseriesSeriesKeyFromNormalized(n!)).toBe("cpu_utilization:host-1");
  });

  it("nested endpoint: time + parent metric", () => {
    const n = normalizePersistedMetricPoint(
      { time: "2025-01-01T00:00:02Z", value: 0.1, labels: { service: "orders" } },
      "memory_utilization",
    );
    expect(n!.metric).toBe("memory_utilization");
    expect(extractSeriesScopeFromNormalized(n!)).toBe("orders");
  });
});
