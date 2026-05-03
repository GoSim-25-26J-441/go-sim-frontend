"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchMetricsAnalysisById } from "@/app/api/asm/routes";
import { Cpu, MemoryStick, AlertCircle, ChevronDown, ChevronLeft, ArrowLeft } from "lucide-react";
import { useAuth } from "@/providers/auth-context";

interface Candidate {
  id: string;
  spec: {
    vcpu: number;
    memory_gb: number;
    label?: string;
  };
  metrics: {
    cpu_util_pct: number;
    mem_util_pct: number;
  };
  sim_workload: {
    concurrent_users: number;
  };
  source: string;
}

interface StoredRequest {
  id: string;
  user_id: string;
  request: {
    design: {
      preferred_vcpu: number;
      preferred_memory_gb: number;
      workload: { concurrent_users: number };
    };
    simulation: { nodes: number };
  };
  response: Array<{
    candidate: Candidate;
    passed_all_required: boolean;
    workload_distance: number;
    suggestions: string[];
  }>;
  best_candidate: {
    candidate: Candidate;
    passed_all_required: boolean;
    workload_distance: number;
    suggestions: string[];
  };
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

type ViewMetricsAnalysisPageProps = {
  id: string;
  projectId?: string;
};

export function ViewMetricsAnalysisContent({ id, projectId }: ViewMetricsAnalysisPageProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<StoredRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMetricsAnalysisById(id)
      .then((res: StoredRequest) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load metrics analysis");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="text-sm text-white/70">Loading metrics analysis…</div>
      </div>
    );
  }

  const costBaseHref = projectId ? `/project/${projectId}/cost` : "/cost";
  const costRunHref = projectId ? `/project/${projectId}/cost/${id}` : `/cost/${id}`;

  if (error || !data) {
    return (
      <div className="p-6 min-h-[80vh] flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-border bg-surface/30 px-8 py-10 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Could not load metrics analysis</h2>
          <p className="text-xs opacity-80 mt-1">{"Not found"}</p>

          <Link
            href={costBaseHref}
            className="mt-6 px-4 py-2 rounded-lg text-xs font-medium border border-border inline-flex items-center gap-2 hover:bg-surface transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Designs
          </Link>
        </div>
      </div>
    );
  }

  const { request, response: allScores, best_candidate: best } = data;
  const design = request.design;
  const simulation = request.simulation;
  const targetUsers = design.workload?.concurrent_users ?? 0;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/40 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-md font-bold text-white">Metrics Analysis</h1>
        </div>
        <Link
          href={costRunHref}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500"
        >
          View Cost Analysis
        </Link>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">
        {/* Design Requirements */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Design Requirements</h2>
          <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-5 md:divide-x md:divide-y-0">
            <div className="min-w-0 py-3 md:px-4 md:py-2">
              <p className="text-xs text-white/60">User</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-white">
                {user?.displayName || user?.email || "Unnamed user"}
              </p>
            </div>
            <div className="min-w-0 py-3 md:px-4 md:py-2">
              <p className="text-xs text-white/60">Preferred vCPU</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{design.preferred_vcpu}</p>
            </div>
            <div className="min-w-0 py-3 md:px-4 md:py-2">
              <p className="text-xs text-white/60">Preferred Memory</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{design.preferred_memory_gb} GB</p>
            </div>
            <div className="min-w-0 py-3 md:px-4 md:py-2">
              <p className="text-xs text-white/60">Target Users</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{targetUsers} users</p>
            </div>
            <div className="min-w-0 py-3 md:px-4 md:py-2">
              <p className="text-xs text-white/60">Cluster Nodes</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{simulation.nodes} nodes</p>
            </div>
          </div>
        </div>

        {/* Best Candidate */}
        <div className="space-y-4 border-t border-white/40 pt-5">
          <h3 className="text-sm font-semibold text-white">Best Candidate</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-4 overflow-hidden rounded-lg bg-white/4">
                <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-4 md:divide-x md:divide-y-0">
                  <div className="min-w-0 px-3 py-3 md:py-3">
                    <p className="text-xs text-white/60">Candidate</p>
                    <p className="mt-0.5 wrap-break-word text-sm font-semibold text-white">
                      {best.candidate.spec?.label ?? best.candidate.id} ({best.candidate.id})
                    </p>
                  </div>
                  <div className="min-w-0 px-3 py-3 md:py-3">
                    <p className="text-xs text-white/60">Specification</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {best.candidate.spec.vcpu} vCPU / {best.candidate.spec.memory_gb} GB
                    </p>
                  </div>
                  <div className="min-w-0 px-3 py-3 md:py-3">
                    <p className="text-xs text-white/60">Workload Performance</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {best.candidate.sim_workload?.concurrent_users ?? 0} users
                    </p>
                  </div>
                  <div className="min-w-0 px-3 py-3 md:py-3">
                    <p className="text-xs text-white/60">Cluster Size</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">{simulation.nodes} nodes</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 overflow-hidden rounded-lg bg-white/4">
                <div className="grid grid-cols-1 divide-y divide-white/40 md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="p-3">
                    <p className="mb-2 text-xs text-white/60">CPU Utilization</p>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-white/80"
                            style={{ width: `${best.candidate.metrics?.cpu_util_pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-semibold text-white">
                        {formatPercentage(best.candidate.metrics?.cpu_util_pct ?? 0)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="mb-2 text-xs text-white/60">Memory Utilization</p>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-white/80"
                            style={{ width: `${best.candidate.metrics?.mem_util_pct ?? 0}%` }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-semibold text-white">
                        {formatPercentage(best.candidate.metrics?.mem_util_pct ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <h4 className="text-xs font-semibold text-white/70">Recommendations</h4>
                <ul className="space-y-1.5 text-xs text-white/75">
                  {(best.suggestions ?? []).map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 text-white/40">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-1">
              <h4 className="mb-3 text-xs font-semibold text-white/70">Performance Summary</h4>
              <div className="divide-y divide-white/40 text-xs">
                <div className="py-2.5 first:pt-0">
                  <p className="text-white/60">Target Users</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{targetUsers} users</p>
                </div>
                <div className="py-2.5">
                  <p className="text-white/60">Achieved Users</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {best.candidate.sim_workload?.concurrent_users ?? 0} users
                  </p>
                </div>
                {(() => {
                  const achieved = best.candidate.sim_workload?.concurrent_users ?? 0;
                  const diff = achieved - targetUsers;
                  const isSurplus = diff >= 0;
                  return (
                    <div className="py-2.5">
                      <p className="text-white/60">{isSurplus ? "Surplus" : "Shortfall"}</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                        {isSurplus ? "+" : ""}{diff} users
                      </p>
                      {targetUsers > 0 && (
                        <p className="mt-1 text-[11px] text-white/50">
                          ({((achieved / targetUsers) * 100).toFixed(1)}% of target)
                        </p>
                      )}
                    </div>
                  );
                })()}
                <div className="py-2.5">
                  <p className="text-white/60">Source</p>
                  <p className="mt-0.5 font-mono text-[11px] text-white/75">{best.candidate.source ?? "—"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* All Candidates Comparison */}
        <div className="space-y-4 border-t border-white/40 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-white">All Candidates Comparison</h3>
            <p className="mt-1 text-xs text-white/50">
              Storage ID: <span className="font-mono text-white/70">{id}</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-xs">
              <thead>
                <tr className="border-b border-border bg-white/5">
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Rank
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Candidate
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Specification
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Utilization
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Shortfall
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allScores.map((score, index) => (
                  <tr key={score.candidate.id} className="transition-colors hover:bg-white/5">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? "bg-white/15 text-white" : "bg-white/10 text-white/75"
                          }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-white">
                          {score.candidate.spec?.label ?? score.candidate.id} ({score.candidate.id})
                        </p>
                        <p className="text-[11px] text-white/45">{score.candidate.source}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 shrink-0 text-white/50" />
                        <span className="text-white/80">{score.candidate.spec.vcpu} vCPU</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <MemoryStick className="h-3.5 w-3.5 shrink-0 text-white/50" />
                        <span className="text-[11px] text-white/45">{score.candidate.spec.memory_gb} GB RAM</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/50">CPU:</span>
                          <span
                            className={`text-xs font-medium ${(score.candidate.metrics?.cpu_util_pct ?? 0) > 80
                              ? "text-red-500"
                              : (score.candidate.metrics?.cpu_util_pct ?? 0) > 60
                                ? "text-yellow-500"
                                : "text-green-500"
                              }`}
                          >
                            {formatPercentage(score.candidate.metrics?.cpu_util_pct ?? 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/50">MEM:</span>
                          <span
                            className={`text-xs font-medium ${(score.candidate.metrics?.mem_util_pct ?? 0) > 80
                              ? "text-red-500"
                              : (score.candidate.metrics?.mem_util_pct ?? 0) > 60
                                ? "text-yellow-500"
                                : "text-green-500"
                              }`}
                          >
                            {formatPercentage(score.candidate.metrics?.mem_util_pct ?? 0)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const achieved = score.candidate.sim_workload?.concurrent_users ?? 0;
                        const diff = achieved - targetUsers;
                        const isSurplus = diff >= 0;
                        return (
                          <>
                            <p className={`text-xs font-medium ${isSurplus ? "text-emerald-400" : "text-red-400"}`}>
                              {isSurplus ? "+" : ""}{diff} users
                            </p>
                            {targetUsers > 0 && (
                              <p className="mt-0.5 text-[11px] text-white/45">
                                {((achieved / targetUsers) * 100).toFixed(1)}% of target
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <details className="group">
              <summary className="flex cursor-pointer items-center text-xs font-medium text-white/70 transition-colors hover:text-white">
                <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                View detailed recommendations for all candidates
              </summary>
              <div className="mt-3 mb-12 divide-y divide-white/40 pb-6">
                {allScores.map((score, index) => (
                  <div
                    key={score.candidate.id}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-white">
                        {index + 1}. {score.candidate.spec?.label ?? score.candidate.id} ({score.candidate.id})
                      </h4>
                      {(() => {
                        const achieved = score.candidate.sim_workload?.concurrent_users ?? 0;
                        const diff = achieved - targetUsers;
                        const isSurplus = diff >= 0;
                        return (
                          <span
                            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              isSurplus
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-red-500/30 bg-red-500/10 text-red-300"
                            }`}
                          >
                            {isSurplus ? "Surplus" : "Shortfall"}: {isSurplus ? "+" : ""}{diff} users
                          </span>
                        );
                      })()}
                    </div>
                    <ul className="space-y-1.5 text-xs text-white/70">
                      {(score.suggestions ?? []).map((s, sIndex) => (
                        <li key={sIndex} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-white/35">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ViewMetricsAnalysisPage() {
  const params = useParams();
  const id = params.id as string;
  return <ViewMetricsAnalysisContent id={id} />;
}