import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from "./http";
import { validateScenarioYaml } from "./scenario-validation";

const mockedAuthenticatedFetch = vi.mocked(authenticatedFetch);

describe("validateScenarioYaml", () => {
  beforeEach(() => {
    mockedAuthenticatedFetch.mockReset();
  });

  it("sends current scenario YAML to backend validate endpoint", async () => {
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          valid: true,
          errors: [],
          warnings: [],
          summary: { hosts: 3, services: 15, workloads: 3 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const yaml = "hosts:\n  - id: host-1\n";
    const result = await validateScenarioYaml(yaml);

    expect(result.valid).toBe(true);
    expect(mockedAuthenticatedFetch).toHaveBeenCalledWith(
      "/v1/scenarios:validate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    const body = JSON.parse(String(mockedAuthenticatedFetch.mock.calls[0]?.[1]?.body)) as {
      scenario_yaml?: string;
    };
    expect(body.scenario_yaml).toBe(yaml);
  });

  it("returns structured invalid response for HTTP 400 validation errors", async () => {
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          valid: false,
          errors: [
            {
              code: "PLACEMENT_INFEASIBLE",
              message: "cannot place service customer-core",
              service_id: "customer-core",
            },
          ],
          warnings: [],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await validateScenarioYaml("services: []");
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.service_id).toBe("customer-core");
    expect(result.errors[0]?.code).toBe("PLACEMENT_INFEASIBLE");
  });

  it("throws connection error when backend is unreachable", async () => {
    mockedAuthenticatedFetch.mockRejectedValue(new Error("network down"));
    await expect(validateScenarioYaml("hosts: []")).rejects.toThrow(
      "Could not validate scenario. Check simulation-core connection."
    );
  });

  it("throws generic error when response body is not JSON", async () => {
    mockedAuthenticatedFetch.mockResolvedValue(
      new Response("<html>bad gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })
    );

    await expect(validateScenarioYaml("hosts: []")).rejects.toThrow("Scenario validation failed (502).");
  });
});
