import { describe, expect, it } from "vitest";
import type { RunCandidateItem } from "@/app/api/asm/routes";
import { mapRunCandidatesToSuggest } from "./map-run-candidates-to-suggest";

describe("mapRunCandidatesToSuggest", () => {
  it("preserves spec vCPU and memory from the candidates endpoint (no per-node division)", () => {
    const items: RunCandidateItem[] = [
      {
        id: "c1",
        spec: { label: "tier-a", memory_gb: 8, vcpu: 4 },
        metrics: { cpu_util_pct: 55, mem_util_pct: 62 },
        sim_workload: { concurrent_users: 900 },
        source: "export",
      },
    ];
    const mapped = mapRunCandidatesToSuggest(items);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].spec.vcpu).toBe(4);
    expect(mapped[0].spec.memory_gb).toBe(8);
    expect(mapped[0].spec.label).toBe("tier-a");
    expect(mapped[0].metrics.cpu_util_pct).toBe(55);
    expect(mapped[0].sim_workload.concurrent_users).toBe(900);
  });
});
