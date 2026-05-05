import type { RunCandidateItem } from "@/app/api/asm/routes";

/** Shape sent to `/api/v1/analysis-suggestions/suggest` candidate arrays from run exports. */
export type MappedSuggestionCandidate = {
  id: string;
  spec: {
    vcpu: number;
    memory_gb: number;
    label: string;
  };
  metrics: {
    cpu_util_pct: number;
    mem_util_pct: number;
  };
  sim_workload: {
    concurrent_users: number;
  };
  source: string;
};

/** Maps run `/candidates` rows for the suggestion API without changing `spec.vcpu` / `spec.memory_gb`. */
export function mapRunCandidatesToSuggest(
  candidates: RunCandidateItem[],
): MappedSuggestionCandidate[] {
  return candidates.map((c) => ({
    id: c.id,
    spec: {
      vcpu: c.spec.vcpu,
      memory_gb: c.spec.memory_gb,
      label: c.spec.label ?? c.id,
    },
    metrics: {
      cpu_util_pct: c.metrics.cpu_util_pct,
      mem_util_pct: c.metrics.mem_util_pct,
    },
    sim_workload: {
      concurrent_users: c.sim_workload?.concurrent_users ?? 0,
    },
    source: c.source ?? "export",
  }));
}
