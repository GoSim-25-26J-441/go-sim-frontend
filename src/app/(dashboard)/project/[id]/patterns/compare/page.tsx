"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, GitCompare } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useToast } from "@/hooks/useToast";
import type {
  AmgApdVersionSummary,
  AnalysisResult,
  Graph,
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
  const router = useRouter();
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
  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [simulationSelectedVersion, setSimulationSelectedVersion] = useState("");
  const exportLeftGraphRef = useRef<(() => Graph | null) | null>(null);
  const exportRightGraphRef = useRef<(() => Graph | null) | null>(null);
  const exportLeftImageRef = useRef<
    (() => string | null | Promise<string | null>) | null
  >(null);
  const exportRightImageRef = useRef<
    (() => string | null | Promise<string | null>) | null
  >(null);

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

  const patternsHref = projectId ? `/project/${projectId}/patterns` : "/dashboard/patterns";

  function downloadCompareJson(side: "left" | "right") {
    if (!compareResult) return;
    const base = side === "left" ? compareResult.left : compareResult.right;
    const getGraph =
      side === "left"
        ? exportLeftGraphRef.current
        : exportRightGraphRef.current;
    const graph = getGraph?.() ?? base.graph;
    const payload = {
      graph,
      detections: base.detections ?? [],
      dot_content: base.dot_content ?? undefined,
      version_id: base.id,
      version_number: base.version_number,
      title: base.title,
      created_at: base.created_at,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `architecture-compare-${side}-v${base.version_number}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`JSON downloaded (${side} version)`, "success");
  }

  function downloadCompareYaml(side: "left" | "right") {
    if (!compareResult) return;
    const base = side === "left" ? compareResult.left : compareResult.right;
    const yaml = base.yaml_content?.trim();
    if (!yaml) {
      showToast(
        `No YAML is available for the ${side} version in this comparison.`,
        "warning",
      );
      return;
    }
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `architecture-compare-${side}-v${base.version_number}.yaml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`YAML downloaded (${side} version)`, "success");
  }

  async function downloadCompareImage(side: "left" | "right") {
    const fn =
      side === "left"
        ? exportLeftImageRef.current
        : exportRightImageRef.current;
    if (!fn) {
      showToast("Graph is not ready to export yet.", "warning");
      return;
    }
    const dataUrl = await Promise.resolve(fn());
    if (!dataUrl) {
      showToast("Could not capture graph image.", "warning");
      return;
    }
    if (!compareResult) return;
    const vn =
      side === "left"
        ? compareResult.left.version_number
        : compareResult.right.version_number;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `architecture-compare-${side}-v${vn}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`Image downloaded (${side} version)`, "success");
  }

  function handleSimulationConfirm() {
    if (projectId && simulationSelectedVersion) {
      router.push(
        `/project/${projectId}/simulation/new?version=${encodeURIComponent(simulationSelectedVersion)}`,
      );
    } else {
      showToast("Please select a version first", "warning");
    }
    setSimulationModalOpen(false);
    setSimulationSelectedVersion("");
  }

  return (
    <div className="p-6 space-y-4 min-w-0">
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={patternsHref}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-md font-bold text-white flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-white/90" />
            Compare Architecture Model Versions
          </h1>
        </div>
        <button
          type="button"
          onClick={() => router.push(patternsHref)}
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
        >
          Back to Graph
        </button>
      </div>

      <div className="min-w-0 flex flex-col gap-6 flex-1 min-h-[calc(100dvh-280px)] max-w-[1600px] mx-auto">
        <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm p-6 shadow-xl shadow-black/20 flex-shrink-0">
          <div className="flex flex-wrap items-end justify-center gap-5">
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
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              {loadingCompare ? "Loading…" : "Compare"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-1 border-b border-white/10">
          <Legend versionCount={versions.length} />
          <div className="flex flex-wrap items-center gap-2 justify-end max-w-full">
            {(
              [
                ["json", "left", () => downloadCompareJson("left")],
                ["yaml", "left", () => downloadCompareYaml("left")],
                ["image", "left", () => void downloadCompareImage("left")],
                ["json", "right", () => downloadCompareJson("right")],
                ["yaml", "right", () => downloadCompareYaml("right")],
                ["image", "right", () => void downloadCompareImage("right")],
              ] as const
            ).map(([kind, side, onClick]) => {
              const sideLabel = side === "left" ? "Left" : "Right";
              return (
              <button
                key={`${kind}-${side}`}
                type="button"
                disabled={!compareResult}
                onClick={onClick}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                {kind === "json" && `Download JSON ${sideLabel}`}
                {kind === "yaml" && `Download YAML ${sideLabel}`}
                {kind === "image" && `Download Image ${sideLabel}`}
              </button>
            );
            })}
            <button
              type="button"
              onClick={() => setSimulationModalOpen(true)}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
            >
              Proceed to Performance Simulator
            </button>
          </div>
        </div>

      {simulationModalOpen && (
        <div
          className="fixed inset-0 z-99999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget && setSimulationModalOpen(false)
          }
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-card/95 backdrop-blur-sm p-6 shadow-xl shadow-black/30"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-1">
              Proceed to Performance Simulation
            </h3>
            <p className="text-sm text-white/60 mb-4">
              Select which version to use for the simulation.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              <label className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider">
                Version
              </label>
              <select
                className="rounded-lg border border-white/15 bg-gray-800 px-4 py-2.5 text-sm text-white scheme-dark focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50"
                value={simulationSelectedVersion}
                onChange={(e) => setSimulationSelectedVersion(e.target.value)}
              >
                <option value="">Select version…</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.version_number} {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSimulationModalOpen(false)}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulationConfirm}
                disabled={!simulationSelectedVersion}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300 flex-shrink-0">
          {error}
        </div>
      )}

      {compareResult && leftData && rightData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
            <div className="border-b border-white/10 bg-white/5 px-5 py-3 flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2] mr-2">
                Left
              </span>
              <span className="text-sm font-semibold text-white">
                #{compareResult.left.version_number}{" "}
                {compareResult.left.title || "Version"}
              </span>
            </div>
            <div className="flex-1 min-h-[50vh] flex flex-col bg-gray-900/50">
              <GraphCanvas
                data={leftData}
                readOnly
                onExportImageReady={(exportPng) => {
                  exportLeftImageRef.current = exportPng;
                }}
                onExportGraphJsonReady={(getGraph) => {
                  exportLeftGraphRef.current = getGraph;
                }}
              />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
            <div className="border-b border-white/10 bg-white/5 px-5 py-3 flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9AA4B2] mr-2">
                Right
              </span>
              <span className="text-sm font-semibold text-white">
                #{compareResult.right.version_number}{" "}
                {compareResult.right.title || "Version"}
              </span>
            </div>
            <div className="flex-1 min-h-[50vh] flex flex-col bg-gray-900/50">
              <GraphCanvas
                data={rightData}
                readOnly
                onExportImageReady={(exportPng) => {
                  exportRightImageRef.current = exportPng;
                }}
                onExportGraphJsonReady={(getGraph) => {
                  exportRightGraphRef.current = getGraph;
                }}
              />
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
