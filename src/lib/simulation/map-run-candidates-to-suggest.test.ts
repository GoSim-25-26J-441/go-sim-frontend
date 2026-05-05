import { describe, expect, it } from "vitest";
import type { RunCandidateItem } from "@/app/api/asm/routes";
import {
  mapRunCandidatesToSuggest,
  restoreSuggestionResponseCandidateSpecs,
} from "./map-run-candidates-to-suggest";

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

  it("restores suggest response candidate specs from sent candidates", () => {
    const sent = mapRunCandidatesToSuggest([
      {
        id: "c1",
        spec: { label: "tier-a", memory_gb: 8, vcpu: 4 },
        metrics: { cpu_util_pct: 55, mem_util_pct: 62 },
        sim_workload: { concurrent_users: 900 },
        source: "export",
      } as RunCandidateItem,
    ]);

    const response = {
      storage_id: "abc",
      best: {
        candidate: {
          ...sent[0],
          spec: { ...sent[0].spec, vcpu: 12, memory_gb: 24 },
        },
        passed_all_required: true,
        workload_distance: 0,
        suggestions: [],
      },
      all_scores: [
        {
          candidate: {
            ...sent[0],
            spec: { ...sent[0].spec, vcpu: 12, memory_gb: 24 },
          },
          passed_all_required: true,
          workload_distance: 0,
          suggestions: [],
        },
      ],
    };

    const restored = restoreSuggestionResponseCandidateSpecs(response, sent);
    expect(restored.best?.candidate.spec.vcpu).toBe(4);
    expect(restored.best?.candidate.spec.memory_gb).toBe(8);
    expect(restored.all_scores?.[0].candidate.spec.vcpu).toBe(4);
    expect(restored.all_scores?.[0].candidate.spec.memory_gb).toBe(8);
  });
});
