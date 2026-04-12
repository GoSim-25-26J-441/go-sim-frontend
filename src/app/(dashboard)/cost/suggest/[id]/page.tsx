"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchMetricsAnalysisById } from "@/app/api/asm/routes";
import { BarChart3, Cpu, MemoryStick, AlertCircle, ChevronDown, ChevronLeft, ArrowLeft } from "lucide-react";
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

function getWorkloadPerformanceColor(distance: number, target: number) {
  if (target === 0) return "text-red-500";
  const percentage = (distance / target) * 100;
  if (percentage <= 5) return "text-green-500";
  if (percentage <= 20) return "text-yellow-500";
  return "text-red-500";
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
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-xl opacity-70">Loading metrics analysis...</div>
      </div>
    );
  }

  const costBaseHref = projectId ? `/project/${projectId}/cost` : "/cost";
  const costRunHref = projectId ? `/project/${projectId}/cost/${id}` : `/cost/${id}`;

  if (error || !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Link
          href={costBaseHref}
          className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Cost Analysis
        </Link>
        <div className="bg-card border border-red-600 rounded-lg p-6 flex items-start gap-2">
          <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 font-medium">Could not load metrics analysis</p>
            <p className="text-sm opacity-80 mt-1">{error ?? "Not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { request, response: allScores, best_candidate: best } = data;
  const design = request.design;
  const simulation = request.simulation;
  const targetUsers = design.workload?.concurrent_users ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="p-6 space-y-4">
        {/* Header */}
        {/* <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link
              href={costBaseHref}
              className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-3xl font-bold">Metrices Analysis</h1>
          </div>
          <Link
            href={costRunHref}
            className="rounded-xl border border-border px-4 py-2 font-medium hover:bg-surface transition-colors inline-flex items-center gap-2"
          >
            View Cost Analysis
          </Link>
        </div> */}
        <div
          className=" flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className='px-4 py-2.5 flex items-center justify-start gap-3 flex-wrap'>
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <h1 className="text-md font-bold text-white flex items-center gap-2">
                Metrics Analysis
              </h1>
            </div>
          </div>
          <div>
            <Link
              href={costRunHref}
              className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
            >
              View Cost Analysis
            </Link>
          </div>
        </div>

        {/* Design Requirements */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Design Requirements</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-card border border-border p-4 rounded-lg">
              <p className="text-sm opacity-60">User</p>
              <p className="text-lg font-semibold">
                {user?.displayName || user?.email || "Unnamed user"}
              </p>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg">
              <p className="text-sm opacity-60">Preferred vCPU</p>
              <p className="text-lg font-semibold">{design.preferred_vcpu}</p>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg">
              <p className="text-sm opacity-60">Preferred Memory</p>
              <p className="text-lg font-semibold">{design.preferred_memory_gb} GB</p>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg">
              <p className="text-sm opacity-60">Target Users</p>
              <p className="text-lg font-semibold">{targetUsers} users</p>
            </div>
            <div className="bg-card border border-border p-4 rounded-lg">
              <p className="text-sm opacity-60">Cluster Nodes</p>
              <p className="text-lg font-semibold">{simulation.nodes} nodes</p>
            </div>
          </div>
        </div>

        {/* Best Candidate */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h3 className="text-xl font-semibold mb-6">Best Candidate</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60">Candidate</p>
                  <p className="text-xl font-bold">
                    {best.candidate.spec?.label ?? best.candidate.id} ({best.candidate.id})
                  </p>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60">Specification</p>
                  <p className="text-xl font-bold">
                    {best.candidate.spec.vcpu} vCPU / {best.candidate.spec.memory_gb} GB
                  </p>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60">Workload Performance</p>
                  <p className="text-xl font-bold">
                    {best.candidate.sim_workload?.concurrent_users ?? 0} users
                  </p>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60">Cluster Size</p>
                  <p className="text-xl font-bold">{simulation.nodes} nodes</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60 mb-2">CPU Utilization</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-card rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${best.candidate.metrics?.cpu_util_pct ?? 0}%` }}
                      />
                    </div>
                    <span className="text-lg font-semibold">
                      {formatPercentage(best.candidate.metrics?.cpu_util_pct ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="bg-card border border-border p-4 rounded-lg">
                  <p className="text-sm opacity-60 mb-2">Memory Utilization</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-card rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${best.candidate.metrics?.mem_util_pct ?? 0}%` }}
                      />
                    </div>
                    <span className="text-lg font-semibold">
                      {formatPercentage(best.candidate.metrics?.mem_util_pct ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Recommendations</h4>
                <ul className="space-y-2">
                  {(best.suggestions ?? []).map((s, i) => (
                    <li key={i} className="flex items-start">
                      <span className="opacity-50 mr-2 mt-1">•</span>
                      <span className="opacity-80">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="font-medium mb-4">Performance Summary</h4>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm opacity-60">Target Users</p>
                    <p className="text-lg font-semibold">{targetUsers} users</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-60">Achieved Users</p>
                    <p className="text-lg font-semibold">
                      {best.candidate.sim_workload?.concurrent_users ?? 0} users
                    </p>
                  </div>
                  {(() => {
                    const achieved = best.candidate.sim_workload?.concurrent_users ?? 0;
                    const diff = achieved - targetUsers;
                    const isSurplus = diff >= 0;
                    return (
                      <div>
                        <p className="text-sm opacity-60">{isSurplus ? "Surplus" : "Shortfall"}</p>
                        <p className={`text-lg font-semibold ${isSurplus ? "text-green-500" : "text-red-500"}`}>
                          {isSurplus ? "+" : ""}{diff} users
                        </p>
                        {targetUsers > 0 && (
                          <p className="text-xs opacity-50 mt-1">
                            ({((Math.abs(diff) / targetUsers) * 100).toFixed(1)}% of target)
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-sm opacity-60">Source</p>
                    <p className="text-sm font-medium opacity-80">{best.candidate.source ?? "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* All Candidates Comparison */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-xl font-semibold">All Candidates Comparison</h3>
            <p className="opacity-60 mt-1">
              Storage ID: <span className="font-mono opacity-80">{id}</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr className="bg-card border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                    Specification
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                    Utilization
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium opacity-60 uppercase tracking-wider">
                    Shortfall
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allScores.map((score, index) => (
                  <tr key={score.candidate.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${index === 0 ? "bg-card text-white" : "bg-card opacity-80 border border-border"
                          }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">
                          {score.candidate.spec?.label ?? score.candidate.id} ({score.candidate.id})
                        </p>
                        <p className="text-sm opacity-50">{score.candidate.source}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 opacity-60" />
                        <span className="opacity-80">{score.candidate.spec.vcpu} vCPU</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <MemoryStick className="w-4 h-4 opacity-60" />
                        <span className="text-sm opacity-50">{score.candidate.spec.memory_gb} GB RAM</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-50">CPU:</span>
                          <span
                            className={`text-sm font-medium ${(score.candidate.metrics?.cpu_util_pct ?? 0) > 80
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
                          <span className="text-xs opacity-50">MEM:</span>
                          <span
                            className={`text-sm font-medium ${(score.candidate.metrics?.mem_util_pct ?? 0) > 80
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
                    <td className="px-4 py-3">
                      {(() => {
                        const achieved = score.candidate.sim_workload?.concurrent_users ?? 0;
                        const diff = achieved - targetUsers;
                        const isSurplus = diff >= 0;
                        return (
                          <>
                            <p className={`font-medium ${isSurplus ? "text-green-500" : "text-red-500"}`}>
                              {isSurplus ? "+" : ""}{diff} users
                            </p>
                            {targetUsers > 0 && (
                              <p className="text-xs opacity-50">
                                {((Math.abs(diff) / targetUsers) * 100).toFixed(1)}% of target
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

          {/* View Detailed Recommendations for All Candidates */}
          <div className="mt-6">
            <details className="group">
              <summary className="cursor-pointer opacity-80 font-medium hover:text-white transition-colors flex items-center">
                <ChevronDown className="w-4 h-4 mr-2 group-open:rotate-180 transition-transform" />
                View Detailed Recommendations for All Candidates
              </summary>
              <div className="mt-4 space-y-4">
                {allScores.map((score, index) => (
                  <div
                    key={score.candidate.id}
                    className="border border-border rounded-lg p-4 bg-card"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">
                        {index + 1}. {score.candidate.spec?.label ?? score.candidate.id} (
                        {score.candidate.id})
                      </h4>
                      {(() => {
                        const achieved = score.candidate.sim_workload?.concurrent_users ?? 0;
                        const diff = achieved - targetUsers;
                        const isSurplus = diff >= 0;
                        return (
                          <span
                            className={`px-2 py-1 text-xs rounded-full border ${isSurplus
                              ? "bg-card text-green-400 border-border"
                              : "bg-card text-red-400 border-border"
                              }`}
                          >
                            {isSurplus ? "Surplus" : "Shortfall"}: {isSurplus ? "+" : ""}{diff} users
                          </span>
                        );
                      })()}
                    </div>
                    <ul className="space-y-2">
                      {(score.suggestions ?? []).map((s, sIndex) => (
                        <li key={sIndex} className="flex items-start">
                          <span className="opacity-50 mr-2 mt-1">•</span>
                          <span className="opacity-60">{s}</span>
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