import { describe, expect, it } from "vitest";
import { extractSeriesScope, extractSeriesScopeByLabel } from "./metrics-series-scope";

describe("extractSeriesScope", () => {
  it("classifies non-prefix host labels as host scope", () => {
    const scope = extractSeriesScope({
      labels: { host: "app-a" },
      metric: "cpu_utilization",
    });
    expect(scope).toBe("app-a");
  });

  it("supports endpoint label grouping when present", () => {
    const scope = extractSeriesScopeByLabel(
      {
        labels: {
          service: "checkout",
          endpoint: "/checkout/place-order",
          origin: "ingress",
          reason: "timeout",
          topic: "orders",
          consumer_group: "payment-workers",
        },
      },
      "endpoint"
    );
    expect(scope).toBe("/checkout/place-order");
  });

  it("supports origin/reason/topic/consumer_group grouping labels", () => {
    const point = {
      labels: {
        origin: "ingress",
        reason: "capacity_guard",
        topic: "orders",
        consumer_group: "group-a",
      },
    };
    expect(extractSeriesScopeByLabel(point, "origin")).toBe("ingress");
    expect(extractSeriesScopeByLabel(point, "reason")).toBe("capacity_guard");
    expect(extractSeriesScopeByLabel(point, "topic")).toBe("orders");
    expect(extractSeriesScopeByLabel(point, "consumer_group")).toBe("group-a");
  });

  it("keeps host grouping for non host-* labels", () => {
    const scope = extractSeriesScopeByLabel({ labels: { host: "broker-a" } }, "host");
    expect(scope).toBe("broker-a");
  });

  it("uses canonical broker label when grouping by broker", () => {
    const scope = extractSeriesScopeByLabel({ labels: { broker: "broker-a" } }, "broker");
    expect(scope).toBe("broker-a");
  });

  it("falls back to broker_service when broker label is absent", () => {
    const scope = extractSeriesScopeByLabel({ labels: { broker_service: "broker-legacy" } }, "broker");
    expect(scope).toBe("broker-legacy");
  });

  it("supports broker tags fallback for broker grouping", () => {
    const scope = extractSeriesScopeByLabel({ tags: { broker: "broker-tags-a" } }, "broker");
    expect(scope).toBe("broker-tags-a");
  });
});
