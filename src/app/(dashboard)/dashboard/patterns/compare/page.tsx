"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, GitCompare } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useToast } from "@/hooks/useToast";
import { useLoading } from "@/hooks/useLoading";
import type { AmgApdVersionSummary, AnalysisResult } from "@/app/features/amg-apd/types";

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

export default function DashboardPatternsComparePage() {
  const { userId } = useAuth();
  const showToast = useToast((s) => s.showToast);
  const headers = () => getAmgApdHeaders({ userId: userId ?? undefined });

  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(
    null,
  );
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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load versions";
        setError(msg);
      } finally {
        setLoadingVersions(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    useLoading.getState().setLoading(false);
  }, []);

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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Compare failed";
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

  const patternsHref = "/dashboard/patterns";
  const dashboardHref = "/dashboard";

  return (
    <div className="min-w-0 space-y-4 p-6">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={dashboardHref}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80 sm:mt-0"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-md flex min-w-0 items-center gap-2 font-bold text-white">
            <GitCompare className="h-5 w-5 shrink-0 text-white/90" />
            <span className="truncate">
              Compare Architecture Model Versions
            </span>
          </h1>
        </div>
        <Link
          href={patternsHref}
          className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-emerald-500"
          aria-label="Back to architecture patterns graph"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Graph
        </Link>
      </div>

      <div className="mx-auto flex min-h-[calc(100dvh-280px)] max-w-400 min-w-0 flex-1 flex-col gap-6">
        <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
          <div className="mb-4 border-b border-white/[0.08] pb-4">
            <h2 className="text-sm font-semibold text-white/95">
              Choose versions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              Select two different saved diagram versions. They open side by side
              below once you run the comparison.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#1a1a1a]/80 p-4 shadow-inner shadow-black/20">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Left version
              </span>
              <select
                className="mt-2 w-full min-w-0 cursor-pointer rounded-md border border-white/12 bg-white/[0.06] px-2.5 py-2 text-sm text-white shadow-sm outline-none transition-colors [color-scheme:dark] hover:border-white/18 focus:border-white/22 focus:ring-1 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-45"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="" className="bg-[#1F1F1F] text-white/70">
                  Select a version…
                </option>
                {versions.map((v) => (
                  <option
                    key={v.id}
                    value={v.id}
                    className="bg-[#1F1F1F] text-white"
                  >
                    #{v.version_number} — {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#1a1a1a]/80 p-4 shadow-inner shadow-black/20">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Right version
              </span>
              <select
                className="mt-2 w-full min-w-0 cursor-pointer rounded-md border border-white/12 bg-white/[0.06] px-2.5 py-2 text-sm text-white shadow-sm outline-none transition-colors [color-scheme:dark] hover:border-white/18 focus:border-white/22 focus:ring-1 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-45"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="" className="bg-[#1F1F1F] text-white/70">
                  Select a version…
                </option>
                {versions.map((v) => (
                  <option
                    key={v.id}
                    value={v.id}
                    className="bg-[#1F1F1F] text-white"
                  >
                    #{v.version_number} — {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-stretch gap-2 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-white/35">
              {loadingVersions
                ? "Loading versions…"
                : versions.length === 0
                  ? "No versions available yet."
                  : `${versions.length} version${versions.length === 1 ? "" : "s"} available`}
            </p>
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
              className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/10 sm:shrink-0"
            >
              {loadingCompare ? "Loading…" : "Compare"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-1 pt-3">
          <Legend versionCount={versions.length} showNodeTypes={false} />
        </div>

        {error && (
          <div className="shrink-0 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {compareResult && leftData && rightData && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] shadow-xl shadow-black/20 backdrop-blur-sm">
              <div className="shrink-0 border-b border-white/[0.08] bg-white/[0.04] px-5 py-3">
                <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-white/45">
                  Left
                </span>
                <span className="text-sm font-semibold text-white">
                  #{compareResult.left.version_number}{" "}
                  {compareResult.left.title || "Version"}
                </span>
              </div>
              <div className="flex min-h-[50vh] flex-1 flex-col bg-[#141414]/90">
                <GraphCanvas data={leftData} readOnly />
              </div>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] shadow-xl shadow-black/20 backdrop-blur-sm">
              <div className="shrink-0 border-b border-white/[0.08] bg-white/[0.04] px-5 py-3">
                <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-white/45">
                  Right
                </span>
                <span className="text-sm font-semibold text-white">
                  #{compareResult.right.version_number}{" "}
                  {compareResult.right.title || "Version"}
                </span>
              </div>
              <div className="flex min-h-[50vh] flex-1 flex-col bg-[#141414]/90">
                <GraphCanvas data={rightData} readOnly />
              </div>
            </div>
          </div>
        )}

        {!compareResult && !loadingCompare && !error && (
          <p className="mt-2 max-w-xl shrink-0 text-sm text-white/60">
            Select two versions and click Compare to view them side by side
            (e.g. initial graph vs after suggestions).
          </p>
        )}
      </div>
    </div>
  );
}
