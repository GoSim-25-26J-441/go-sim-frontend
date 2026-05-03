"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gauge,
  X,
} from "lucide-react";
import PatternsView from "@/app/features/amg-apd/components/PatternsView";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AmgApdVersionSummary } from "@/app/features/amg-apd/types";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { usePatternsGuidesWithProfile } from "@/app/features/amg-apd/hooks/usePatternsGuidesWithProfile";
import { useReturnToChatFromPatterns } from "@/modules/di/useReturnToChatFromPatterns";
import { useAuth } from "@/providers/auth-context";
import { useToast } from "@/hooks/useToast";

export default function ProjectPatternsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { returnToChat, returning } = useReturnToChatFromPatterns(projectId);
  const patternsGraphFullscreen = useAmgApdStore(
    (s) => s.patternsGraphFullscreen,
  );
  const { guidesActive, toggleGuides } = usePatternsGuidesWithProfile();
  const { userId } = useAuth();
  const showToast = useToast((s) => s.showToast);

  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [simulationSelectedVersion, setSimulationSelectedVersion] =
    useState("");
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId?.trim()) return;
    (async () => {
      setLoadingVersions(true);
      try {
        const res = await fetch("/api/amg-apd/versions", {
          headers: getAmgApdHeaders({
            userId: userId ?? undefined,
            chatId: projectId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setVersions(data?.versions ?? []);
      } catch {
        if (!cancelled) setVersions([]);
      } finally {
        if (!cancelled) setLoadingVersions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

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

  return (
    <div
      className={
        patternsGraphFullscreen
          ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          : "min-w-0 space-y-4 p-6"
      }
    >
      {!patternsGraphFullscreen && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
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
            <div className="min-w-0 flex flex-col gap-0.5">
              <h1 className="text-sm font-bold leading-snug text-white sm:text-base">
                Architecture Model Generator & Anti-Pattern Detector
              </h1>
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Project · <span className="font-mono">{projectId}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              data-amg-designer={AMG_DESIGNER.guides}
              onClick={() =>
                void toggleGuides().catch(() =>
                  showToast("Could not save guide preference", "error"),
                )
              }
              title={
                guidesActive
                  ? "Hide guided highlights"
                  : "Show guided highlights"
              }
              className={`flex items-center gap-2 rounded-lg px-3 py-2 shadow-md transition-colors hover:text-white ${
                guidesActive
                  ? "text-amber-300"
                  : "text-white/80 hover:bg-gray-800/50"
              }`}
            >
              <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-sm font-normal">Guides</span>
            </button>
            <div className="flex items-center gap-1.5">
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
        </div>
      )}

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
              aria-labelledby="patterns-simulation-modal-title"
              aria-describedby="patterns-simulation-modal-desc"
            >
              <div
                className="absolute top-0 right-0 left-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
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
                      id="patterns-simulation-modal-title"
                      className="text-sm font-semibold leading-tight text-white sm:text-base"
                    >
                      Proceed to Performance Simulation
                    </h2>
                    <span
                      id="patterns-simulation-modal-desc"
                      className="mt-0.5 block text-[11px] text-gray-500"
                    >
                      Select a saved diagram version to load in the simulator
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSimulationModal}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-gray-200 transition-colors hover:bg-white/15"
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
                    htmlFor="patterns-simulation-version-select"
                    className="text-[11px] font-medium text-gray-400"
                  >
                    Version
                  </label>
                  <select
                    id="patterns-simulation-version-select"
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

      <div
        className={
          patternsGraphFullscreen
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "min-w-0"
        }
      >
        <PatternsView
          projectId={projectId}
          onReturnToChat={() => returnToChat()}
          stickyToolbar={false}
          onRequestOpenSimulationModal={openSimulationModal}
          onCloseSimulationModal={closeSimulationModal}
        />
      </div>
    </div>
  );
}
