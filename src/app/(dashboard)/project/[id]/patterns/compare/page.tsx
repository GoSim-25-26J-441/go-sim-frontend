"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitCompare } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useToast } from "@/hooks/useToast";
import type {
  AmgApdVersionSummary,
  AnalysisResult,
} from "@/app/features/amg-apd/types";

type CompareResult = {
  left: AnalysisResult & {
    id: string;
    version_number: number;
    title: string;
    created_at: string;
    yaml_content?: string;
  };
  right: AnalysisResult & {
    id: string;
    version_number: number;
    title: string;
    created_at: string;
    yaml_content?: string;
  };
};

export default function ProjectPatternsComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { userId } = useAuth();
  const showToast = useToast((s) => s.showToast);
  const headers = () =>
    getAmgApdHeaders({
      userId: userId ?? undefined,
      ...(projectId ? { chatId: projectId } : {}),
    });

  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingVersions(true);
      try {
        const res = await fetch("/api/amg-apd/versions", {
          headers: headers(),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setVersions(data?.versions ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load versions");
      } finally {
        setLoadingVersions(false);
      }
    })();
  }, [projectId, userId]);

  async function runCompare() {
    if (!leftId || !rightId || leftId === rightId) {
      setError("Select two different versions.");
      showToast("Select two different versions to compare.", "warning");
      return;
    }
    setError(null);
    setLoadingCompare(true);
    setCompareResult(null);
    try {
      const res = await fetch(
        `/api/amg-apd/versions/compare?left=${encodeURIComponent(leftId)}&right=${encodeURIComponent(rightId)}`,
        { headers: headers() },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data?.left?.graph || !data?.right?.graph) {
        throw new Error("Compare response missing left or right graph");
      }
      setCompareResult({
        left: data.left,
        right: data.right,
      });
      showToast("Comparison loaded", "success");
    } catch (e: any) {
      const msg = e?.message ?? "Compare failed";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoadingCompare(false);
    }
  }

  const leftData = compareResult?.left
    ? {
        graph: compareResult.left.graph,
        detections: compareResult.left.detections ?? [],
        dot_content: compareResult.left.dot_content,
      }
    : null;
  const rightData = compareResult?.right
    ? {
        graph: compareResult.right.graph,
        detections: compareResult.right.detections ?? [],
        dot_content: compareResult.right.dot_content,
      }
    : null;

  return (
    <div className="p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-shrink-0 py-4 px-1">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={projectId ? `/project/${projectId}/patterns` : "/dashboard/patterns"}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors inline-flex"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <GitCompare className="w-5 h-5" />
              Compare Architecture Model Versions
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Project <span className="font-mono text-xs">{projectId}</span>
            </p>
          </div>
        </div>
        <Link
          href={projectId ? `/project/${projectId}/patterns` : "/dashboard/patterns"}
          className="flex-shrink-0 rounded-2xl border border-white/15 bg-card/80 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
        >
          Back to graph
        </Link>
      </div>

      <div className="min-w-0 flex flex-col gap-6 flex-1 min-h-[calc(100dvh-280px)] max-w-[1600px] mx-auto">
        <div className="rounded-3xl border border-white/10 bg-gray-900/80 backdrop-blur-sm p-6 shadow-xl shadow-black/20 flex-shrink-0">
          <div className="flex flex-wrap items-end gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2]">
                Left version
              </label>
              <select
                className="rounded-2xl border border-white/15 bg-gray-800 px-4 py-2.5 text-sm text-white min-w-[220px] focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50 focus:border-[#9AA4B2]/50 [color-scheme:dark]"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="">Select…</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.version_number} {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2]">
                Right version
              </label>
              <select
                className="rounded-2xl border border-white/15 bg-gray-800 px-4 py-2.5 text-sm text-white min-w-[220px] focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50 focus:border-[#9AA4B2]/50 [color-scheme:dark]"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="">Select…</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.version_number} {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={runCompare}
              disabled={
                loadingVersions ||
                loadingCompare ||
                !leftId ||
                !rightId ||
                leftId === rightId
              }
              className="rounded-2xl bg-[#9AA4B2] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#9AA4B2]/20 hover:bg-[#9AA4B2]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loadingCompare ? "Loading…" : "Compare"}
            </button>
          </div>
        </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300 flex-shrink-0">
          {error}
        </div>
      )}

      {compareResult && leftData && rightData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          <div className="rounded-3xl border border-white/10 bg-gray-900/80 overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
            <div className="border-b border-white/10 bg-[#9AA4B2]/20 px-5 py-3 flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2] mr-2">
                Left
              </span>
              <span className="text-sm font-semibold text-white">
                #{compareResult.left.version_number}{" "}
                {compareResult.left.title || "Version"}
              </span>
            </div>
            <div className="flex-1 min-h-[50vh] flex flex-col bg-gray-900/50">
              <GraphCanvas data={leftData} readOnly />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-gray-900/80 overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
            <div className="border-b border-white/10 bg-[#9AA4B2]/20 px-5 py-3 flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2] mr-2">
                Right
              </span>
              <span className="text-sm font-semibold text-white">
                #{compareResult.right.version_number}{" "}
                {compareResult.right.title || "Version"}
              </span>
            </div>
            <div className="flex-1 min-h-[50vh] flex flex-col bg-gray-900/50">
              <GraphCanvas data={rightData} readOnly />
            </div>
          </div>
        </div>
      )}

      {!compareResult && !loadingCompare && !error && (
        <p className="text-sm text-white/60 max-w-xl flex-shrink-0 mt-2">
          Select two versions and click Compare to view them side by side (e.g.
          initial graph vs after suggestions).
        </p>
      )}
      </div>
    </div>
  );
}
