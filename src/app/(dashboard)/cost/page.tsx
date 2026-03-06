"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchDesignsList } from '@/app/api/asm/routes';
import { useAuth } from "@/providers/auth-context";
import {
  BarChart3,
  Cpu,
  MemoryStick,
  CheckCircle,
  CalendarDays,
  FileText,
  Circle,
  ChevronRight,
  FolderOpen
} from 'lucide-react';

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
      spec: { vcpu: number; memory_gb: number }
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

export default function CostPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { user, userId: firebaseUid } = useAuth();

  useEffect(() => {
    if (!firebaseUid) return;
    fetchRuns(firebaseUid);
  }, [firebaseUid]);

  const fetchRuns = async (uid: string) => {
    try {
      setLoading(true);
      const data = await fetchDesignsList(uid);
      const runList: Run[] = data.rows.map((row: ApiResponseRow, index: number) => ({
        id: row.id,
        project_id: row.project_id,
        run_id: row.run_id,
        requestNumber: index + 1,
        workload: row.request.design.workload.concurrent_users,
        preferred_vcpu: row.request.design.preferred_vcpu,
        preferred_memory_gb: row.request.design.preferred_memory_gb,
        created_at: new Date(row.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        best_candidate: row.best_candidate,
        all_candidates: row.response || []
      }));

      setRuns(runList.filter((r) => (r.project_id || "") === PROJECT_ID));
    } catch (err) {
      console.error('Error fetching runs:', err);
      // const fallbackData: Run[] = [
      //   {
      //     id: "0610bab4-a1a6-4ab2-9314-2e54caa1d126",
      //     requestNumber: 1,
      //     workload: 2000,
      //     preferred_vcpu: 5,
      //     preferred_memory_gb: 24,
      //     created_at: "Dec 4, 2025, 22:43",
      //     best_candidate: {
      //       candidate: {
      //         spec: { vcpu: 16, memory_gb: 64 }
      //       },
      //       workload_distance: 100
      //     },
      //     all_candidates: []
      //   },
      //   {
      //     id: "1e9a8484-958b-42a6-99c0-1e671a21eed6",
      //     requestNumber: 2,
      //     workload: 2000,
      //     preferred_vcpu: 8,
      //     preferred_memory_gb: 16,
      //     created_at: "Dec 4, 2025, 22:18",
      //     best_candidate: {
      //       candidate: {
      //         spec: { vcpu: 4, memory_gb: 8 }
      //       },
      //       workload_distance: 100
      //     },
      //     all_candidates: []
      //   }
      // ];
      // setRuns(fallbackData);
    } finally {
      setLoading(false);
    }
  };

  const handleRunClick = (run: Run) => {
    router.push(`/cost/${run.id}`);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-border mb-4"></div>
            <p className="text-lg opacity-70">Loading runs...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header Section */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold">Cost Analysis</h1>
              <p className="opacity-60 mt-2 text-sm">Select a run to view detailed cost breakdown</p>
            </div>
            <Link
              href="/cost/suggest"
              className="rounded-xl border border-border px-6 py-3 font-medium flex items-center gap-2 hover:bg-surface transition-colors"
            >
              <BarChart3 className="w-5 h-5" />
              Metrices Analysis
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Runs list */}
        <div className="mb-8">
          {runs.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-card">
              <FileText className="w-16 h-16 opacity-50 mx-auto mb-4" />
              <h3 className="text-xl font-semibold opacity-80 mb-3">No runs found</h3>
              <p className="opacity-60 max-w-md mx-auto text-sm">Run metrics analysis to add runs and analyze infrastructure costs.</p>
            </div>
          ) : (
            <div>
              <h3 className=" mb-4 flex items-center gap-2 text-2xl font-bold">
                <FolderOpen className="w-5 h-5 opacity-70" />
                Project: {PROJECT_ID}
              </h3>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Runs</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {runs.map((run, index) => (
                  <div
                    key={run.id}
                    className="group bg-card border border-border rounded-xl p-6 hover:bg-surface cursor-pointer transition-all duration-300 hover:border-white/20"
                    onClick={() => handleRunClick(run)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Circle className="w-3 h-3 opacity-50" fill="currentColor" />
                          <span className="text-xs opacity-60">
                            Run #{index + 1}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold transition-colors">
                          {run.workload != null
                            ? `${run.workload.toLocaleString()} Users Workload`
                            : "Workload not specified"}
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-card border border-border opacity-80">
                          ID: {run.id.substring(0, 8)}...
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs opacity-60 mb-1 flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            Created
                          </p>
                          <p className="text-sm opacity-90">
                            {new Date(run.created_at).toLocaleDateString("en-US", {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-card border border-border rounded-lg p-3">
                          <p className="text-xs opacity-60 mb-2">Preferred Spec</p>
                          <div className="flex items-center gap-2 mb-1">
                            <Cpu className="w-4 h-4 opacity-70" />
                            <span className="font-medium">{run.preferred_vcpu} vCPU</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MemoryStick className="w-4 h-4 opacity-70" />
                            <span className="font-medium">{run.preferred_memory_gb} GB RAM</span>
                          </div>
                        </div>

                        {run.best_candidate && (
                          <div className="bg-card border border-border rounded-lg p-3">
                            <p className="text-xs opacity-60 mb-2">Recommended</p>
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="font-medium">
                                {run.best_candidate.candidate.spec.vcpu} vCPU
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="font-medium">
                                {run.best_candidate.candidate.spec.memory_gb} GB RAM
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs opacity-60">Click to view cost analysis</span>
                          <ChevronRight className="w-5 h-5 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <Link
                          href={`/cost/suggest/${run.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-medium opacity-70 hover:opacity-100 flex items-center gap-1"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          View Metrices Analysis
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-12 pt-6 border-t border-border">
          <div className="text-center">
            <p className="text-sm opacity-60">
              Showing {runs.length} run{runs.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs opacity-50 mt-2">
              Select any run to analyze cloud provider costs, compare pricing options, and optimize your infrastructure
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}