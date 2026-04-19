/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import SuggestionModal, {
  type Suggestion,
} from "@/app/features/amg-apd/components/SuggestionModal";
import VersionSidebar from "@/app/features/amg-apd/components/VersionSidebar";
import PatternsDesignerTour from "@/app/features/amg-apd/components/patternsDesignerTour/PatternsDesignerTour";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useToast } from "@/hooks/useToast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useOpenInChat } from "@/modules/di/useOpenInChat";
import { fetchLatestProjectDiagramVersionId } from "@/modules/di/fetchLatestProjectDiagramVersionId";
import type {
  AnalysisResult,
  AmgApdVersionSummary,
  Graph,
} from "@/app/features/amg-apd/types";
import {
  nodeLayoutPayloadFromGraph,
  type NodeLayoutPayload,
} from "@/app/features/amg-apd/utils/graphEditUtils";

type PatternsViewProps = {
  projectId?: string;
  onReturnToChat?: () => void;
};

export default function PatternsView({
  projectId,
  onReturnToChat,
}: PatternsViewProps) {
  const router = useRouter();
  const last = useAmgApdStore((s) => s.last);
  const editedYaml = useAmgApdStore((s) => s.editedYaml);
  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const regenerating = useAmgApdStore((s) => s.regenerating);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);
  const commitGraphBaseline = useAmgApdStore((s) => s.commitGraphBaseline);
  const resetGraphBaseline = useAmgApdStore((s) => s.resetGraphBaseline);
  const setPatternsGraphFullscreen = useAmgApdStore(
    (s) => s.setPatternsGraphFullscreen,
  );
  const { userId } = useAuth();

  const showToast = useToast((s) => s.showToast);
  const openInChat = useOpenInChat();
  const headers = () =>
    getAmgApdHeaders({
      userId: userId ?? undefined,
      ...(projectId ? { chatId: projectId } : {}),
    });

  const [open, setOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [graphVersion, setGraphVersion] = useState(0);
  const [versionCount, setVersionCount] = useState<number | null>(null);
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [versionsRefreshTrigger, setVersionsRefreshTrigger] = useState(0);
  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [simulationSelectedVersion, setSimulationSelectedVersion] =
    useState("");
  const [duplicateNameForModal, setDuplicateNameForModal] = useState<
    string | null
  >(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenGenPhase, setFullscreenGenPhase] = useState<
    null | "generating" | "success"
  >(null);

  const [newDesignerTourEnabled, setNewDesignerTourEnabled] = useState(true);
  const [designerTourVersionsNonce, setDesignerTourVersionsNonce] =
    useState(0);
  const [designerTourWorkspaceNonce, setDesignerTourWorkspaceNonce] =
    useState(0);
  const [designerTourExpandDetailsNonce, setDesignerTourExpandDetailsNonce] =
    useState(0);
  const [designerTourSuggestionPreviewExpandNonce, setDesignerTourSuggestionPreviewExpandNonce] =
    useState(0);
  const [designerWelcomeOpen, setDesignerWelcomeOpen] = useState(false);
  const dismissedDesignerWelcomeRef = useRef(false);

  const openVersionsForTour = useCallback(() => {
    setDesignerTourVersionsNonce((n) => n + 1);
  }, []);
  const prepareEditWorkspaceForTour = useCallback(() => {
    setDesignerTourWorkspaceNonce((n) => n + 1);
  }, []);
  const expandDetailAccordionsForTour = useCallback(() => {
    setDesignerTourExpandDetailsNonce((n) => n + 1);
  }, []);
  const expandSuggestionFirstPreviewForTour = useCallback(() => {
    setDesignerTourSuggestionPreviewExpandNonce((n) => n + 1);
  }, []);
  const openSimulationModalForTour = useCallback(() => {
    setSimulationModalOpen(true);
  }, []);

  const dismissDesignerWelcome = useCallback(() => {
    dismissedDesignerWelcomeRef.current = true;
    setDesignerWelcomeOpen(false);
  }, []);

  const handleTourChapterClose = useCallback(() => {
    setOpen(false);
    setSimulationModalOpen(false);
  }, []);

  useEffect(() => {
    if (!newDesignerTourEnabled) {
      dismissedDesignerWelcomeRef.current = false;
      setDesignerWelcomeOpen(false);
    }
  }, [newDesignerTourEnabled]);

  useEffect(() => {
    if (!newDesignerTourEnabled || !last?.graph || dismissedDesignerWelcomeRef.current) {
      return;
    }
    setDesignerWelcomeOpen(true);
  }, [newDesignerTourEnabled, last?.graph]);

  useEffect(() => {
    setPatternsGraphFullscreen(fullscreenOpen);
  }, [fullscreenOpen, setPatternsGraphFullscreen]);

  useEffect(() => {
    return () => setPatternsGraphFullscreen(false);
  }, [setPatternsGraphFullscreen]);

  const exportImageRef = useRef<(() => string | null | Promise<string | null>) | null>(null);
  const exportGraphJsonRef = useRef<(() => Graph | null) | null>(null);
  const restoreStartedRef = useRef(false);

  const hasDetections = (last?.detections?.length ?? 0) > 0;

  function handleResetCanvas() {
    const ok = resetGraphBaseline();
    if (ok) {
      setGraphVersion((v) => v + 1);
      showToast("Graph reset to the last saved version", "success");
    } else {
      showToast("No saved baseline to reset to yet.", "warning");
    }
  }

  async function analyzeAndSaveAsNewVersion(
    yamlContent: string,
    title?: string,
    nodeLayout?: NodeLayoutPayload,
  ): Promise<AnalysisResult> {
    let versionTitle = title;
    if (versionTitle == null || versionTitle.trim() === "") {
      const listRes = await fetch("/api/amg-apd/versions", {
        headers: headers(),
      });
      const listData = listRes.ok ? await listRes.json() : {};
      const list = listData?.versions ?? [];
      const maxVersionNumber =
        list.length === 0
          ? 0
          : Math.max(
              ...list.map(
                (v: { version_number?: number }) => v.version_number ?? 0,
              ),
            );
      const nextNum = maxVersionNumber + 1;
      versionTitle = `diagramV${nextNum}`;
    }

    const blob = new Blob([yamlContent], { type: "text/yaml" });
    const fd = new FormData();
    fd.append("file", blob, "architecture.yaml");
    fd.append("title", versionTitle.trim());
    if (nodeLayout && Object.keys(nodeLayout).length > 0) {
      fd.append("node_layout", JSON.stringify(nodeLayout));
    }

    const res = await fetch("/api/amg-apd/analyze-upload", {
      method: "POST",
      headers: headers(),
      body: fd,
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Analyze failed");
    }

    const data: AnalysisResult = await res.json();
    if (!data?.graph) throw new Error("Backend did not return a graph.");
    return data;
  }

  async function refetchVersions() {
    try {
      const res = await fetch("/api/amg-apd/versions", {
        headers: headers(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data?.versions ?? [];
      setVersions(list);
      setVersionCount(list.length);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (last?.graph || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    setRegenerating(true);

    (async () => {
      try {
        const listRes = await fetch("/api/amg-apd/versions", {
          headers: headers(),
        });
        if (!listRes.ok) return;

        const listData = await listRes.json();
        const versionsList = listData?.versions ?? [];
        if (versionsList.length === 0) return;

        const sorted = [...versionsList].sort(
          (
            a: { created_at?: string; version_number?: number },
            b: { created_at?: string; version_number?: number },
          ) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (bTime !== aTime) return bTime - aTime;
            return (b.version_number ?? 0) - (a.version_number ?? 0);
          },
        );

        const latest = sorted[0];
        const versionRes = await fetch(`/api/amg-apd/versions/${latest.id}`, {
          headers: headers(),
        });
        if (!versionRes.ok) return;

        const v = await versionRes.json();
        const graph = v?.graph;
        const yamlContent = v?.yaml_content;
        if (!graph || !yamlContent) return;

        const data: AnalysisResult = {
          graph,
          detections: v?.detections ?? [],
          dot_content: v?.dot_content,
          version_id: v?.id,
          version_number: v?.version_number,
          created_at: v?.created_at,
        };

        setLast(data);
        setEditedYaml(yamlContent);
        commitGraphBaseline();
      } catch {
        // Leave graph empty
      } finally {
        setRegenerating(false);
      }
    })();
  }, [
    last?.graph,
    projectId,
    setLast,
    setEditedYaml,
    setRegenerating,
    commitGraphBaseline,
  ]);

  /** Baseline is not persisted; seed it when session storage rehydrates `last` + YAML. */
  useEffect(() => {
    if (!last?.graph || editedYaml == null || editedYaml === "") return;
    const st = useAmgApdStore.getState();
    if (!st.baselineLast?.graph) st.commitGraphBaseline();
  }, [last?.graph, last?.version_id, editedYaml]);

  useEffect(() => {
    if (!last?.graph) return;
    (async () => {
      try {
        const res = await fetch("/api/amg-apd/versions", {
          headers: headers(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = data?.versions ?? [];
        setVersions(list);
        setVersionCount(list.length);
      } catch {
        setVersionCount(null);
        setVersions([]);
      }
    })();
  }, [last?.graph, projectId]);

  function handleReturnToChat() {
    if (onReturnToChat) {
      onReturnToChat();
    } else if (projectId) {
      void (async () => {
        try {
          const diagramVersionId =
            await fetchLatestProjectDiagramVersionId(projectId);
          await openInChat(projectId, { diagramVersionId });
        } catch {
          showToast("Could not open chat", "error");
        }
      })();
    } else {
      showToast("Return to Chat is not available here", "info");
    }
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

  function handleDownloadYaml() {
    if (!editedYaml) {
      showToast(
        "No current YAML found. Upload a YAML or generate one from Edit mode.",
        "warning",
      );
      return;
    }

    const blob = new Blob([editedYaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "architecture.yaml";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("YAML downloaded", "success");
  }

  function handleDownloadJson() {
    if (!last) {
      showToast("No graph data to download.", "warning");
      return;
    }
    const graphFromCanvas = exportGraphJsonRef.current?.() ?? null;
    const graph = graphFromCanvas ?? last.graph;
    const payload = {
      graph,
      detections: last.detections ?? [],
      dot_content: last.dot_content ?? undefined,
      version_id: last.version_id,
      version_number: last.version_number,
      created_at: last.created_at,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "architecture.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("JSON downloaded", "success");
  }

  async function handleDownloadImage() {
    const fn = exportImageRef.current;
    if (!fn) {
      showToast(
        "Graph is not ready to export. Wait for the diagram to load.",
        "warning",
      );
      return;
    }
    const dataUrl = await Promise.resolve(fn());
    if (!dataUrl) {
      showToast(
        "Graph is not ready to export. Wait for the diagram to load.",
        "warning",
      );
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "architecture-graph.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Image downloaded", "success");
  }

  const openSuggestions = useCallback(async () => {
    if (!editedYaml) {
      showToast("No current YAML available. Upload a YAML first.", "warning");
      return;
    }

    setOpen(true);
    setErr(null);
    setLoadingSug(true);
    setSugs([]);

    try {
      const res = await fetch("/api/amg-apd/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAmgApdHeaders({
            userId: userId ?? undefined,
            ...(projectId ? { chatId: projectId } : {}),
          }),
        },
        body: JSON.stringify({
          yaml: editedYaml,
          title: "Architecture",
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setSugs((data?.suggestions ?? []) as Suggestion[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load suggestions");
    } finally {
      setLoadingSug(false);
    }
  }, [editedYaml, projectId, showToast, userId]);

  async function applySuggestions(selectedIds: string[]) {
    if (!editedYaml) {
      showToast("No current YAML available.", "warning");
      return;
    }

    setApplyLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/amg-apd/apply-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers(),
        },
        body: JSON.stringify({
          job_id: "ui",
          yaml: editedYaml,
          title: "Architecture",
          selected_suggestion_ids: selectedIds,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();

      const fixedYaml = data?.fixed_yaml as string | undefined;
      const fixedAnalysis = data?.fixed_analysis as AnalysisResult | undefined;

      if (!fixedYaml || !fixedAnalysis?.graph) {
        throw new Error(
          "Backend did not return fixed_yaml / fixed_analysis.graph",
        );
      }

      const nodeLayout = nodeLayoutPayloadFromGraph(
        exportGraphJsonRef.current?.() ?? undefined,
      );

      setEditedYaml(fixedYaml);
      setLast(fixedAnalysis);
      setSugs((data?.applied_fixes ?? []) as Suggestion[]);
      setOpen(false);

      setRegenerating(true);
      try {
        const saved = await analyzeAndSaveAsNewVersion(
          fixedYaml,
          undefined,
          nodeLayout,
        );
        setLast(saved);
        commitGraphBaseline();
        setGraphVersion((v) => v + 1);
        await refetchVersions();
        setVersionsRefreshTrigger((t) => t + 1);
        showToast("Suggestions applied successfully", "success");
      } catch (e: any) {
        setErr(e?.message ?? "Failed to save as new version");
        showToast(e?.message ?? "Failed to save as new version", "error");
      } finally {
        setRegenerating(false);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to apply suggestions");
      showToast(e?.message ?? "Failed to apply suggestions", "error");
    } finally {
      setApplyLoading(false);
    }
  }

  async function generateGraphFromYaml(
    yaml: string,
    nodeLayout?: NodeLayoutPayload,
    opts?: { exitFullscreenAfterSuccess?: boolean },
  ) {
    const exitAfter = opts?.exitFullscreenAfterSuccess === true;
    if (exitAfter) {
      setFullscreenGenPhase("generating");
    }
    setRegenerating(true);
    try {
      const data = await analyzeAndSaveAsNewVersion(
        yaml,
        undefined,
        nodeLayout,
      );
      setLast(data);
      setEditedYaml(yaml);
      commitGraphBaseline();
      setGraphVersion((v) => v + 1);
      await refetchVersions();
      setVersionsRefreshTrigger((t) => t + 1);
      showToast("Graph generated successfully", "success");
      if (exitAfter) {
        setFullscreenGenPhase("success");
        await new Promise((r) => window.setTimeout(r, 950));
        setFullscreenOpen(false);
        setFullscreenGenPhase(null);
        if (projectId) {
          router.push(`/project/${projectId}/patterns`);
        } else {
          router.refresh();
        }
      }
    } catch (err: any) {
      if (exitAfter) {
        setFullscreenGenPhase(null);
      }
      showToast(
        "Failed to generate graph: " + (err?.message ?? "Unknown error"),
        "error",
      );
      throw err;
    } finally {
      setRegenerating(false);
    }
  }

  if (!last?.graph) {
    if (regenerating) {
      return (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm p-12 text-center shadow-xl shadow-black/20">
            <div className="flex flex-col items-center gap-6">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#9AA4B2] border-t-transparent" />
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white/95">
                  Loading your latest version
                </h2>
                <p className="text-sm text-white/60">
                  Fetching YAML, building graph, and detecting anti-patterns…
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm p-10 text-center shadow-xl shadow-black/20">
          <h2 className="text-xl font-semibold text-white/95 mb-2">
            No graph to display
          </h2>
          <p className="text-sm text-white/60 max-w-md mx-auto">
            Open a project and generate a diagram to analyze patterns.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        fullscreenOpen
          ? "mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
          : "mx-auto flex min-h-0 w-full max-w-400 flex-col space-y-2 overflow-x-hidden pb-6"
      }
    >
      {simulationModalOpen && (
        <div
          className="fixed inset-0 z-99999 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
          onClick={(e) =>
            e.target === e.currentTarget && setSimulationModalOpen(false)
          }
        >
          <div
            data-amg-designer={AMG_DESIGNER.simulationModal}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-slate-950/98 shadow-2xl shadow-black/50 ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 bg-slate-900/80 px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">
                Performance simulation
              </p>
              <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-white">
                Continue to simulator
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Pick a saved diagram version. The simulator loads that snapshot so results match what you see in
                patterns.
              </p>
            </div>

            <div className="px-6 py-5">
              <div
                className="flex flex-col gap-2"
                data-amg-designer={AMG_DESIGNER.simulationVersionSelect}
              >
                <label
                  htmlFor="simulation-version-select"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Version
                </label>
                <select
                  id="simulation-version-select"
                  className="rounded-xl border border-white/15 bg-slate-900/90 px-4 py-3 text-sm text-white shadow-inner shadow-black/20 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                  value={simulationSelectedVersion}
                  onChange={(e) => setSimulationSelectedVersion(e.target.value)}
                >
                  <option value="">Select a version…</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      #{v.version_number} {v.title || "Untitled"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t border-white/10 bg-slate-900/70 px-6 py-4"
              data-amg-designer={AMG_DESIGNER.simulationModalFooter}
            >
              <button
                type="button"
                onClick={() => setSimulationModalOpen(false)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:border-white/25 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulationConfirm}
                disabled={!simulationSelectedVersion}
                className="rounded-lg border border-emerald-500/40 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500/95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      <SuggestionModal
        open={open}
        loading={loadingSug}
        suggestions={sugs}
        error={err}
        onClose={() => setOpen(false)}
        onApply={applySuggestions}
        applyLoading={applyLoading}
        disabledApply={!hasDetections || loadingSug}
        designerTourExpandFirstPreviewNonce={designerTourSuggestionPreviewExpandNonce}
      />

      <PatternsDesignerTour
        enabled={newDesignerTourEnabled}
        onEnabledChange={setNewDesignerTourEnabled}
        onRequestVersionsMenuOpen={openVersionsForTour}
        onRequestEditWorkspace={prepareEditWorkspaceForTour}
        onRequestExpandDetailAccordions={expandDetailAccordionsForTour}
        hasSuggestionsTour={hasDetections && !!editedYaml}
        onRunSuggestionsForTour={openSuggestions}
        onRequestExpandSuggestionFirstPreview={expandSuggestionFirstPreviewForTour}
        onRequestOpenSimulationModal={openSimulationModalForTour}
        hasReturnToChatTour={!onReturnToChat}
        welcomeIntroOpen={designerWelcomeOpen}
        onDismissWelcomeIntro={dismissDesignerWelcome}
        onTourChapterClose={handleTourChapterClose}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <ConfirmModal
            open={duplicateNameForModal !== null}
            onClose={() => setDuplicateNameForModal(null)}
            title="Duplicate name"
            message={
              duplicateNameForModal
                ? `A node named "${duplicateNameForModal}" already exists. Please choose a different name.`
                : ""
            }
            confirmLabel="OK"
            variant="warning"
            alertOnly
            onConfirm={() => setDuplicateNameForModal(null)}
          />,
          document.body,
        )}

      {!fullscreenOpen && (
        <div className="sticky top-0 z-20 shrink-0 overflow-hidden px-3 pt-2 pb-2 shadow-xl shadow-black/20 pointer-events-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto [&_select]:pointer-events-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
            <VersionSidebar
              refreshTrigger={versionsRefreshTrigger}
              projectId={projectId}
              designerTourForceOpenNonce={designerTourVersionsNonce}
            />

            <button
              type="button"
              data-amg-designer={AMG_DESIGNER.viewSuggestions}
              onClick={openSuggestions}
              disabled={!hasDetections || !editedYaml}
              className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                hasDetections && editedYaml
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-gray-500/50 text-white/60 cursor-not-allowed"
              }`}
              title={
                !editedYaml
                  ? "No current YAML available"
                  : hasDetections
                    ? "View suggestions to fix detected anti-patterns"
                    : "No anti-patterns detected"
              }
            >
              View Suggestions
            </button>

            <div
              className="flex flex-wrap items-center gap-2"
              data-amg-designer={AMG_DESIGNER.toolbarDownloads}
            >
              <button
                type="button"
                onClick={handleDownloadYaml}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
              >
                Download YAML
              </button>

              <button
                type="button"
                onClick={handleDownloadJson}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
              >
                Download JSON
              </button>

              <button
                type="button"
                onClick={handleDownloadImage}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
              >
                Download Image
              </button>

              {!onReturnToChat && (
                <button
                  type="button"
                  data-amg-designer={AMG_DESIGNER.returnToChat}
                  onClick={handleReturnToChat}
                  className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
                >
                  Return to Chat
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div
              className="min-w-0"
              data-amg-designer={AMG_DESIGNER.legend}
            >
              <Legend
                versionCount={versionCount ?? undefined}
                showNodeTypes={false}
              />
            </div>

            <div className="shrink-0">
              <button
                type="button"
                data-amg-designer={AMG_DESIGNER.simulator}
                onClick={() => setSimulationModalOpen(true)}
                className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
              >
                Proceed to Performance Simulator
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={
          fullscreenOpen
            ? "relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
            : "relative min-w-0 w-full"
        }
      >
        <div
          className={
            fullscreenOpen
              ? "flex min-h-0 min-w-0 flex-1 flex-col gap-2 bg-slate-950 p-2 sm:p-2.5"
              : "flex min-w-0 flex-col overflow-hidden bg-card/80 shadow-xl shadow-black/20 backdrop-blur-sm"
          }
        >
          {fullscreenOpen && (
            <div className="shrink-0 border-b border-white/15 bg-slate-950 px-3 py-2.5 sm:px-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9AA4B2]">
                Anti-pattern legend
              </div>
              <div
                className="mt-2 min-w-0"
                data-amg-designer={AMG_DESIGNER.legend}
              >
                <Legend
                  versionCount={versionCount ?? undefined}
                  showNodeTypes={false}
                />
              </div>
            </div>
          )}
          <div
            className={
              fullscreenOpen
                ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-card/80 backdrop-blur-sm"
                : "flex-1 min-h-0 flex flex-col"
            }
          >
            <GraphCanvas
              key={`amg-apd-graph-v${graphVersion}`}
              data={last}
              isGenerating={regenerating}
              showRegeneratingOverlay={regenerating}
              layoutMode={fullscreenOpen ? "fullscreen" : "default"}
              onExportImageReady={(fn) => {
                exportImageRef.current = fn;
              }}
              onExportGraphJsonReady={(getGraph) => {
                exportGraphJsonRef.current = getGraph;
              }}
              onDuplicateName={(name) => setDuplicateNameForModal(name)}
              onGenerateGraph={(yaml, nodeLayout) =>
                generateGraphFromYaml(yaml, nodeLayout, {
                  exitFullscreenAfterSuccess: fullscreenOpen,
                })
              }
              onResetCanvas={handleResetCanvas}
              fullscreenButton={{
                onClick: () => setFullscreenOpen((o) => !o),
                isFullscreen: fullscreenOpen,
              }}
              newDesignerTourEnabled={newDesignerTourEnabled}
              onNewDesignerTourEnabledChange={setNewDesignerTourEnabled}
              designerTourWorkspaceNonce={designerTourWorkspaceNonce}
              designerTourExpandDetailsNonce={designerTourExpandDetailsNonce}
            />
          </div>
        </div>
      </div>

      {fullscreenGenPhase &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[350000] flex items-center justify-center p-4 animate-in fade-in duration-300"
            aria-live="polite"
            aria-busy={fullscreenGenPhase === "generating"}
          >
            {/* Match CheckPatternsOverlay (chat “Check Anti-Patterns”) */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              aria-hidden
            />
            <div className="relative z-10 w-full max-w-sm rounded-lg border border-white/[0.08] bg-[#111]/98 shadow-xl p-5 animate-fade-in-up">
              {fullscreenGenPhase === "generating" ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-white">
                      Generating new graph
                    </p>
                    <p className="text-xs text-white/50">
                      Saving a new version, rebuilding the canvas, and running
                      anti-pattern detection…
                    </p>
                  </div>
                  <div className="w-full h-px bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/15 rounded-full animate-check-patterns-progress"
                      style={{ width: "32%" }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/25 animate-ping [animation-duration:2s]" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600/90 shadow-lg shadow-emerald-500/20">
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-white">Graph ready</p>
                    <p className="text-xs text-white/50">
                      Taking you back to the patterns view…
                    </p>
                  </div>
                  <div className="w-full h-px bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 animate-check-patterns-progress"
                      style={{ width: "55%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
