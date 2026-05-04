"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
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
  const { userId } = useAuth();
  const showToast = useToast((s) => s.showToast);
  const { returnToChat, returning } = useReturnToChatFromPatterns(projectId);
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
  const [patternsReturnLabel, setPatternsReturnLabel] = useState<string | null>(
    null,
  );

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

  const goBackToPatterns = useCallback(() => {
    setPatternsReturnLabel("Returning to patterns workspace…");
    window.setTimeout(() => {
      router.push(patternsHref);
    }, 50);
  }, [router, patternsHref]);

  return (
    <div className="min-w-0 space-y-4 p-6">
      {patternsReturnLabel &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[500000] flex items-center justify-center p-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300"
              aria-hidden
            />
            <div className="relative flex w-full min-w-[min(22rem,92vw)] max-w-[min(34rem,calc(100vw-2rem))] flex-col items-stretch gap-6 rounded-xl border border-white/10 bg-zinc-900/96 px-10 py-9 text-center shadow-2xl ring-1 ring-black/35 animate-in fade-in zoom-in-95 duration-300">
              <div
                className="flex h-10 items-end justify-center gap-1.5"
                aria-hidden
              >
                {[32, 52, 40, 64, 36, 48].map((hPct, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-sm bg-zinc-500/80 motion-safe:animate-pulse"
                    style={{
                      height: `${hPct}%`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: "1.05s",
                    }}
                  />
                ))}
              </div>
              <div className="space-y-2 border-t border-white/[0.07] pt-5">
                <p className="text-sm font-semibold tracking-tight text-zinc-100">
                  {patternsReturnLabel}
                </p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Please wait while we return to the patterns canvas.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={goBackToPatterns}
            disabled={!!patternsReturnLabel}
            aria-label="Back to patterns canvas"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80 disabled:cursor-wait disabled:opacity-70"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold text-white sm:text-base">
            <GitCompare className="h-5 w-5 shrink-0 text-white/90" />
            <span className="min-w-0 leading-snug">
              Compare Architecture Model Versions
            </span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void returnToChat()}
            disabled={returning}
            aria-label="Back to project chat"
            className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {returning ? "Opening…" : "Chat"}
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

      <div className="min-w-0 flex flex-col gap-6 flex-1 min-h-[calc(100dvh-280px)] max-w-400 mx-auto">
        <div className="shrink-0 rounded-xl border border-white/10 bg-zinc-900/40 p-5 shadow-lg shadow-black/25 backdrop-blur-sm sm:p-6">
          <div className="mb-4 border-b border-white/[0.07] pb-4">
            <h2 className="text-sm font-semibold text-white/90 sm:text-base">
              Choose versions
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 sm:text-[13px]">
              Select two different saved diagram versions. They open side by side
              below once you run the comparison.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="flex min-w-0 flex-col rounded-xl border border-white/[0.1] bg-zinc-900/75 p-4 sm:p-5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-[11px]">
                Left version
              </span>
              <select
                className="mt-2.5 w-full min-w-0 cursor-pointer rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/30 transition-colors scheme-dark hover:border-white/18 focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="">Select a version…</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.version_number} — {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col rounded-xl border border-white/[0.1] bg-zinc-900/75 p-4 sm:p-5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-[11px]">
                Right version
              </span>
              <select
                className="mt-2.5 w-full min-w-0 cursor-pointer rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/30 transition-colors scheme-dark hover:border-white/18 focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                disabled={loadingVersions}
              >
                <option value="">Select a version…</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.version_number} — {v.title || "Untitled"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-stretch gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-zinc-500">
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
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white sm:shrink-0"
            >
              {loadingCompare ? "Loading…" : "Compare"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] pb-2 pt-2">
          <Legend
            versionCount={versions.length}
            showNodeTypes={false}
            patternsCompareZincAntiPatternModal
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300 shrink-0">
            {error}
          </div>
        )}

        {compareResult && leftData && rightData && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/45 shadow-lg shadow-black/25 backdrop-blur-sm">
              <div className="shrink-0 border-b border-white/[0.07] bg-zinc-900/80 px-3 py-2">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Left
                </span>
                <span className="text-xs font-semibold text-zinc-100">
                  #{compareResult.left.version_number}{" "}
                  {compareResult.left.title || "Version"}
                </span>
              </div>
              <div className="flex min-h-[48vh] flex-1 flex-col bg-zinc-950/40">
                <GraphCanvas
                  data={leftData}
                  readOnly
                  projectPatternsPage
                />
              </div>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/45 shadow-lg shadow-black/25 backdrop-blur-sm">
              <div className="shrink-0 border-b border-white/[0.07] bg-zinc-900/80 px-3 py-2">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Right
                </span>
                <span className="text-xs font-semibold text-zinc-100">
                  #{compareResult.right.version_number}{" "}
                  {compareResult.right.title || "Version"}
                </span>
              </div>
              <div className="flex min-h-[48vh] flex-1 flex-col bg-zinc-950/40">
                <GraphCanvas
                  data={rightData}
                  readOnly
                  projectPatternsPage
                />
              </div>
            </div>
          </div>
        )}

        {!compareResult && !loadingCompare && !error && (
          <p className="mt-2 max-w-xl shrink-0 text-sm text-zinc-500">
            Select two versions and click Compare to view them side by side
            (e.g. initial graph vs after suggestions).
          </p>
        )}
      </div>

      {simulationModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[160000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
            onClick={(e) =>
              e.target === e.currentTarget && closeSimulationModal()
            }
          >
            <div
              data-amg-designer={AMG_DESIGNER.simulationModal}
              className="relative mx-4 flex max-h-[min(52vh,20rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900/98 shadow-2xl ring-1 ring-black/25"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="compare-simulation-modal-title"
              aria-describedby="compare-simulation-modal-desc"
            >
              <div
                className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
                aria-hidden
              />

              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Gauge
                    className="h-5 w-5 shrink-0 text-gray-300"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h2
                      id="compare-simulation-modal-title"
                      className="text-sm font-semibold leading-tight text-white sm:text-base"
                    >
                      Proceed to Performance Simulation
                    </h2>
                    <span
                      id="compare-simulation-modal-desc"
                      className="mt-0.5 block text-[11px] text-gray-500"
                    >
                      Select a saved diagram version to load in the simulator
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSimulationModal}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <div className="min-h-0 px-4 py-2.5">
                <div
                  className="flex flex-col gap-1.5"
                  data-amg-designer={AMG_DESIGNER.simulationVersionSelect}
                >
                  <label
                    htmlFor="compare-simulation-version-select"
                    className="text-[11px] font-medium text-gray-400"
                  >
                    Version
                  </label>
                  <select
                    id="compare-simulation-version-select"
                    className="w-full rounded-md border border-white/10 bg-zinc-800 py-1.5 pl-2.5 pr-8 text-sm text-white scheme-dark focus:outline-none focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    value={simulationSelectedVersion}
                    onChange={(e) =>
                      setSimulationSelectedVersion(e.target.value)
                    }
                    disabled={loadingVersions}
                  >
                    <option value="" className="bg-zinc-900 text-gray-400">
                      {loadingVersions
                        ? "Loading versions…"
                        : "Select version…"}
                    </option>
                    {versions.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        className="bg-zinc-900 text-white"
                      >
                        #{v.version_number} {v.title || "Untitled"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-4 py-2.5"
                data-amg-designer={AMG_DESIGNER.simulationModalFooter}
              >
                <button
                  type="button"
                  onClick={closeSimulationModal}
                  className="rounded-md border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-zinc-700/90"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSimulationConfirm}
                  disabled={!simulationSelectedVersion}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
