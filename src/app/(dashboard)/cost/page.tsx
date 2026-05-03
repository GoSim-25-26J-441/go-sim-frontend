/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchDesignsList } from "@/app/api/asm/routes";
import { useAuth } from "@/providers/auth-context";
import {
  BarChart3,
  Cpu,
  MemoryStick,
  CheckCircle,
  CalendarDays,
  Circle,
  ArrowLeft,
  Upload,
  Loader2,
  Play,
} from "lucide-react";
import { DiagramImagesModal } from "@/components/project/DiagramImagesModal";

interface Run {
  id: string;
  project_id?: string;
  run_id?: string;
  requestNumber: number;
  workload: number;
  preferred_vcpu: number;
  preferred_memory_gb: number;
  created_at: string;
  best_candidate: {
    candidate: {
      spec: { vcpu: number; memory_gb: number };
    };
    workload_distance: number;
  };
  all_candidates: any[];
}

interface ApiResponseRow {
  id: string;
  project_id?: string;
  run_id?: string;
  created_at: string;
  request: {
    design: {
      workload: { concurrent_users: number };
      preferred_vcpu: number;
      preferred_memory_gb: number;
    };
  };
  best_candidate: any;
  response: any[];
}

const PROJECT_ID = "abc";

type CostPageProps = {
  projectId?: string;
};

export default function CostPage({ projectId = PROJECT_ID }: CostPageProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDiagramImagesModal, setShowDiagramImagesModal] = useState(false);
  const router = useRouter();
  const { userId: firebaseUid } = useAuth();

  const fetchRuns = useCallback(
    async (uid: string) => {
      try {
        setLoading(true);
        const data = await fetchDesignsList(uid);
        const runList: Run[] = data.rows.map(
          (row: ApiResponseRow, index: number) => ({
            id: row.id,
            project_id: row.project_id,
            run_id: row.run_id,
            requestNumber: index + 1,
            workload: row.request.design.workload.concurrent_users,
            preferred_vcpu: row.request.design.preferred_vcpu,
            preferred_memory_gb: row.request.design.preferred_memory_gb,
            created_at: new Date(row.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            best_candidate: row.best_candidate,
            all_candidates: row.response || [],
          }),
        );

        setRuns(runList.filter((r) => (r.project_id || "") === projectId));
      } catch (err) {
        console.error("Error fetching runs:", err);

      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!firebaseUid) return;
    fetchRuns(firebaseUid);
  }, [fetchRuns, firebaseUid]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  const runsWithRunId = runs.filter(
    (run) => run.run_id != null && run.run_id !== ""
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-6">
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80 sm:mt-0"
            aria-label="Back to project summary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-md font-bold text-white">
              Cost Analysis
            </h1>
            <p className="text-xs text-white/60">
              Select a run to view detailed cost breakdown
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDiagramImagesModal(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-white/80 shadow-md transition-colors hover:bg-gray-800/50 hover:text-white"
          >
            <Upload className="h-4 w-4" />
            <span className="text-sm font-normal">
              Show Diagram and resource images
            </span>
          </button>
        </div>
      </div>

      <DiagramImagesModal
        projectId={projectId}
        isOpen={showDiagramImagesModal}
        onClose={() => setShowDiagramImagesModal(false)}
      />

      <div className="mt-6 flex min-h-0 flex-1 flex-col space-y-6">
        {runsWithRunId.length === 0 ? (
          <div className="flex min-h-[min(560px,calc(100vh-14rem))] flex-1 flex-col items-center justify-center py-8">
            <div className="max-w-md space-y-4 px-4 text-center">
              <p className="text-base text-white/80">No runs found yet.</p>
              <p className="text-sm text-white/50">
                Run metrics analysis to add runs and analyze infrastructure
                costs.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <ul className="shrink-0 divide-y divide-white/40">
              {runs
                .filter((run) => run.run_id != null && run.run_id !== "")
                .map((run, index) => {
                  const costHref = projectId
                    ? `/project/${projectId}/cost/${run.id}`
                    : `/cost/${run.id}`;
                  const suggestHref = projectId
                    ? `/project/${projectId}/cost/suggest/${run.id}`
                    : `/cost/suggest/${run.id}`;
                  return (
                    <li
                      key={run.id}
                      className="flex items-start justify-between gap-4 py-5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">
                            {run.workload != null
                              ? `${run.workload.toLocaleString()} Users Workload`
                              : "Workload not specified"}
                          </p>
                          <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white/60 bg-white/10">
                            <Circle
                              className="h-2 w-2 opacity-60"
                              fill="currentColor"
                            />
                            Run #{index + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-white/40">
                          <CalendarDays className="h-3 w-3 shrink-0 opacity-70" />
                          <span>Created {run.created_at}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-white/50">
                          <span className="flex items-center gap-1.5">
                            <span className="text-white/30">Preferred</span>
                            <Cpu className="h-3 w-3 opacity-70" />
                            <span className="font-mono text-white/70">
                              {run.preferred_vcpu} vCPU
                            </span>
                            <MemoryStick className="h-3 w-3 opacity-70" />
                            <span className="font-mono text-white/70">
                              {run.preferred_memory_gb} GB
                            </span>
                          </span>
                          {run.best_candidate?.candidate?.spec && (
                            <span className="flex items-center gap-1.5">
                              <span className="text-white/30">Recommended</span>
                              <CheckCircle className="h-3 w-3 shrink-0 text-green-400/90" />
                              <span className="font-mono text-white/70">
                                {run.best_candidate.candidate.spec.vcpu} vCPU
                              </span>
                              <CheckCircle className="h-3 w-3 shrink-0 text-green-400/90" />
                              <span className="font-mono text-white/70">
                                {run.best_candidate.candidate.spec.memory_gb}{" "}
                                GB
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 pt-0.5">
                        <Link
                          href={suggestHref}
                          className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90"
                        >
                          <BarChart3 className="h-3 w-3" />
                          Metrics
                        </Link>
                        <Link
                          href={costHref}
                          className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600/80 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:bg-emerald-500"
                        >
                          <Play className="h-3 w-3" />
                          View
                        </Link>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
