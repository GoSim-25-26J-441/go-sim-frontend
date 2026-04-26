import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from "./http";
import { getRunConfiguration, SimulationApiError } from "./simulation";

const mockedAuthenticatedFetch = vi.mocked(authenticatedFetch);

describe("getRunConfiguration", () => {
  beforeEach(() => {
    mockedAuthenticatedFetch.mockReset();
  });

  it("returns normalized runtime configuration on success", async () => {
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          configuration: {
            services: [{ service_id: "checkout", replicas: 3 }],
            workload: [{ pattern_key: "steady", rate_rps: 120 }],
            hosts: [{ host_id: "h1", cpu_cores: 8 }],
            placements: [{ service_id: "checkout", instance_id: "checkout-1", host_id: "h1" }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const configuration = await getRunConfiguration("run-1");
    expect(configuration.services?.[0]).toMatchObject({
      service_id: "checkout",
      id: "checkout",
      replicas: 3,
    });
    expect(configuration.workload?.[0]).toMatchObject({ pattern_key: "steady", rate_rps: 120 });
    expect(configuration.hosts?.[0]).toMatchObject({ host_id: "h1", cpu_cores: 8 });
    expect(configuration.placements?.[0]).toMatchObject({ service_id: "checkout", host_id: "h1" });
  });

  it("preserves SimulationApiError status for 412 responses", async () => {
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "runtime config unavailable" }),
        { status: 412, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(getRunConfiguration("run-412")).rejects.toMatchObject({
      name: "SimulationApiError",
      status: 412,
      message: "runtime config unavailable",
    } satisfies Partial<SimulationApiError>);
  });
});
