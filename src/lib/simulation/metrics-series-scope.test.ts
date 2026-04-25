import { describe, expect, it } from "vitest";
import { extractSeriesScope } from "./metrics-series-scope";

describe("extractSeriesScope", () => {
  it("classifies non-prefix host labels as host scope", () => {
    const scope = extractSeriesScope({
      labels: { host: "app-a" },
      metric: "cpu_utilization",
    });
    expect(scope).toBe("app-a");
  });
});
