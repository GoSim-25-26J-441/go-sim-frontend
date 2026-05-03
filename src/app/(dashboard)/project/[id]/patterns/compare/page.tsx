"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Gauge,
  GitCompare,
  X,
} from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useToast } from "@/hooks/useToast";
import { useLoading } from "@/hooks/useLoading";
import { useReturnToChatFromPatterns } from "@/modules/di/useReturnToChatFromPatterns";
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

export default function ProjectPatternsComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { returnToChat, returning } = useReturnToChatFromPatterns(projectId);
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
  const [compareResult, setCompareResult] = useState<CompareResult | null>(
    null,
  );
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [simulationSelectedVersion, setSimulationSelectedVersion] =
    useState("");

  const openSimulationModal = useCallback(() => {
    setSimulationModalOpen(true);
  }, []);

  const closeSimulationModal = useCallback(() => {
    setSimulationModalOpen(false);
    setSimulationSelectedVersion("");
  }, []);

  function handleSimulationConfirm() {
    if (projectId && simulationSelectedVersion) {
      router.push(
        `/project/${projectId}/simulation/new?version=${encodeURIComponent(simulationSelectedVersion)}`,
      );
    } else {
      showToast("Please select a version first", "warning");
    }
    closeSimulationModal();
  }

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

  const patternsHref = projectId
    ? `/project/${projectId}/patterns`
    : "/dashboard/patterns";

  return (
    <div className="min-w-0 space-y-4 p-6">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={patternsHref}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80 sm:mt-0"
            aria-label="Back to architecture patterns"
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
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void returnToChat()}
            disabled={returning}
            aria-label="Back to project chat"
            className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {returning ? "Opening…" : "chat"}
          </button>
          <button
            type="button"
            data-amg-designer={AMG_DESIGNER.simulator}
            onClick={openSimulationModal}
            aria-label="Proceed to performance simulation"
            title="Choose a diagram version, then open performance simulation"
            className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-emerald-500"
          >
            Simulation
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      </div>

      {simulationModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-220000 flex items-center justify-center bg-black/10 p-4 backdrop-blur-md"
            onClick={(e) =>
              e.target === e.currentTarget && closeSimulationModal()
            }
          >
            <div
              data-amg-designer={AMG_DESIGNER.simulationModal}
              className="relative mx-4 flex w-full max-w-md flex-col overflow-hidden rounded-md bg-[#1F1F1F] shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="compare-simulation-modal-title"
              aria-describedby="compare-simulation-modal-desc"
            >
              <div
                className="absolute top-0 right-0 left-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                }}
              />

              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Gauge className="h-6 w-6 shrink-0 text-white" aria-hidden />
                  <div className="min-w-0">
                    <h2
                      id="compare-simulation-modal-title"
                      className="text-base font-semibold leading-none text-white"
                    >
                      Proceed to Performance Simulation
                    </h2>
                    <span
                      id="compare-simulation-modal-desc"
                      className="mt-0.5 block text-xs"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      Select a saved diagram version to load in the simulator
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSimulationModal}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white p-0 text-black shadow-sm transition-colors hover:bg-gray-200"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="px-5 py-3">
                <div
                  className="flex max-w-xs flex-col gap-1.5"
                  data-amg-designer={AMG_DESIGNER.simulationVersionSelect}
                >
                  <label
                    htmlFor="compare-simulation-version-select"
                    className="text-[10px] font-semibold uppercase tracking-wider text-white/45"
                  >
                    Version
                  </label>
                  <select
                    id="compare-simulation-version-select"
                    className="w-full max-w-xs rounded-md border border-white/12 bg-white/6 px-2.5 py-1.5 text-xs text-white shadow-sm outline-none transition-colors focus:border-white/22 focus:ring-1 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-45"
                    value={simulationSelectedVersion}
                    onChange={(e) =>
                      setSimulationSelectedVersion(e.target.value)
                    }
                    disabled={loadingVersions}
                  >
                    <option value="" className="bg-[#1F1F1F] text-white/80">
                      {loadingVersions
                        ? "Loading versions…"
                        : "Select version…"}
                    </option>
                    {versions.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        className="bg-[#1F1F1F] text-white"
                      >
                        #{v.version_number} {v.title || "Untitled"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className="flex justify-end gap-2 px-4 pt-3 pb-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
                data-amg-designer={AMG_DESIGNER.simulationModalFooter}
              >
                <button
                  type="button"
                  onClick={closeSimulationModal}
                  className="rounded-md bg-zinc-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSimulationConfirm}
                  disabled={!simulationSelectedVersion}
                  className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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

        <div className="flex flex-wrap items-center gap-3 pt-3 pb-1 border-b border-white/10">
          <Legend versionCount={versions.length} showNodeTypes={false} />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300 shrink-0">
            {error}
          </div>
        )}

        {compareResult && leftData && rightData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
              <div className="border-b border-white/[0.08] bg-white/[0.04] px-5 py-3 shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/45 mr-2">
                  Left
                </span>
                <span className="text-sm font-semibold text-white">
                  #{compareResult.left.version_number}{" "}
                  {compareResult.left.title || "Version"}
                </span>
              </div>
              <div className="flex-1 min-h-[50vh] flex flex-col bg-[#141414]/90">
                <GraphCanvas data={leftData} readOnly />
              </div>
            </div>
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden shadow-xl shadow-black/20 flex flex-col min-h-0">
              <div className="border-b border-white/[0.08] bg-white/[0.04] px-5 py-3 shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/45 mr-2">
                  Right
                </span>
                <span className="text-sm font-semibold text-white">
                  #{compareResult.right.version_number}{" "}
                  {compareResult.right.title || "Version"}
                </span>
              </div>
              <div className="flex-1 min-h-[50vh] flex flex-col bg-[#141414]/90">
                <GraphCanvas data={rightData} readOnly />
              </div>
            </div>
          </div>
        )}

        {!compareResult && !loadingCompare && !error && (
          <p className="text-sm text-white/60 max-w-xl shrink-0 mt-2">
            Select two versions and click Compare to view them side by side
            (e.g. initial graph vs after suggestions).
          </p>
        )}
      </div>
    </div>
  );
}
