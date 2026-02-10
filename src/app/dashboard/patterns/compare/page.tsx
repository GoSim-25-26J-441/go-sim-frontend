"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type {
  AmgApdVersionSummary,
  AnalysisResult,
} from "@/app/features/amg-apd/types";

type CompareResult = {
  left: AnalysisResult & { id: string; version_number: number; title: string; created_at: string; yaml_content?: string };
  right: AnalysisResult & { id: string; version_number: number; title: string; created_at: string; yaml_content?: string };
};

export default function ComparePage() {
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
          headers: getAmgApdHeaders(),
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
  }, []);

  async function runCompare() {
    if (!leftId || !rightId || leftId === rightId) {
      setError("Select two different versions.");
      return;
    }
    setError(null);
    setLoadingCompare(true);
    setCompareResult(null);
    try {
      const res = await fetch(
        `/api/amg-apd/versions/compare?left=${encodeURIComponent(leftId)}&right=${encodeURIComponent(rightId)}`,
        { headers: getAmgApdHeaders() }
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
    } catch (e: any) {
      setError(e?.message ?? "Compare failed");
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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/patterns"
          className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
        >
          ← Back to graph
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Compare versions</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-slate-100 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-700">Left version</label>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-slate-400"
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
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-700">Right version</label>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-slate-400"
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
          disabled={loadingVersions || loadingCompare || !leftId || !rightId || leftId === rightId}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingCompare ? "Loading…" : "Compare"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {compareResult && leftData && rightData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
            <div className="border-b border-slate-200 bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">
              #{compareResult.left.version_number} {compareResult.left.title || "Left"}
            </div>
            <div className="h-[50vh] bg-slate-100">
              <GraphCanvas data={leftData} />
            </div>
          </div>
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
            <div className="border-b border-slate-200 bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">
              #{compareResult.right.version_number} {compareResult.right.title || "Right"}
            </div>
            <div className="h-[50vh] bg-slate-100">
              <GraphCanvas data={rightData} />
            </div>
          </div>
        </div>
      )}

      {!compareResult && !loadingCompare && !error && (
        <p className="text-sm text-slate-600">
          Select two versions and click Compare to view them side by side (e.g. initial graph vs after suggestions).
        </p>
      )}
    </div>
  );
}
