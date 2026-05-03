import { describe, expect, it } from "vitest";
import { formatOnlineOptimizationBestScore } from "./objective-labels";

describe("formatOnlineOptimizationBestScore", () => {
  it("formats utilization objectives as percent", () => {
    expect(formatOnlineOptimizationBestScore(0.712, "cpu_utilization")).toBe("71.20%");
    expect(formatOnlineOptimizationBestScore(0.5, "memory_utilization")).toBe("50.00%");
  });

  it("formats P95 objectives as milliseconds", () => {
    expect(formatOnlineOptimizationBestScore(123.456, "p95_latency")).toBe("123.46 ms");
    expect(formatOnlineOptimizationBestScore(99.1, "p95_latency_ms")).toBe("99.10 ms");
  });
});
