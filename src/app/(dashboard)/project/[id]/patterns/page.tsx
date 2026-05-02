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
  const guidesActive = useAmgApdStore((s) => s.patternsGuidesEnabled);
  const togglePatternsGuides = useAmgApdStore((s) => s.togglePatternsGuides);
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
              onClick={() => togglePatternsGuides()}
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
            className="fixed inset-0 z-220000 flex items-center justify-center bg-black/10 p-4 backdrop-blur-md"
            onClick={(e) =>
              e.target === e.currentTarget && closeSimulationModal()
            }
          >
            <div
              data-amg-designer={AMG_DESIGNER.simulationModal}
              className="relative mx-4 flex w-full max-w-md flex-col overflow-hidden rounded-md shadow-xl bg-[#1F1F1F]"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="patterns-simulation-modal-title"
              aria-describedby="patterns-simulation-modal-desc"
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
                  <Gauge
                    className="h-6 w-6 shrink-0 text-white"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h2
                      id="patterns-simulation-modal-title"
                      className="text-base font-semibold leading-none text-white"
                    >
                      Proceed to Performance Simulation
                    </h2>
                    <span
                      id="patterns-simulation-modal-desc"
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
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="px-5 py-4">
                <div
                  className="flex flex-col gap-2"
                  data-amg-designer={AMG_DESIGNER.simulationVersionSelect}
                >
                  <label
                    htmlFor="patterns-simulation-version-select"
                    className="text-xs font-medium text-white/70"
                  >
                    Version
                  </label>
                  <select
                    id="patterns-simulation-version-select"
                    className="w-full rounded-lg bg-white px-4 py-2.5 text-sm text-black scheme-light focus:outline-none focus:ring-2 focus:ring-black/15 disabled:cursor-not-allowed disabled:opacity-50"
                    value={simulationSelectedVersion}
                    onChange={(e) =>
                      setSimulationSelectedVersion(e.target.value)
                    }
                    disabled={loadingVersions}
                  >
                    <option value="" className="bg-white text-black">
                      {loadingVersions
                        ? "Loading versions…"
                        : "Select version…"}
                    </option>
                    {versions.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        className="bg-white text-black"
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
                  className="rounded-full px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-white/10"
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSimulationConfirm}
                  disabled={!simulationSelectedVersion}
                  className="rounded-full px-4 py-2 text-xs font-medium text-black transition-all duration-150 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-45 bg-white"
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
