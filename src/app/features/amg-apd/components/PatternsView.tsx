/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import SuggestionModal, {
  type Suggestion,
} from "@/app/features/amg-apd/components/SuggestionModal";
import VersionSidebar from "@/app/features/amg-apd/components/VersionSidebar";
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
  const [graphRegenerating, setGraphRegenerating] = useState(false);
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

  const exportImageRef = useRef<(() => string | null | Promise<string | null>) | null>(null);
  const exportGraphJsonRef = useRef<(() => Graph | null) | null>(null);
  const restoreStartedRef = useRef(false);

  const hasDetections = (last?.detections?.length ?? 0) > 0;
  const showGraphOverlay = graphRegenerating || regenerating;

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
      } catch {
        // Leave graph empty
      } finally {
        setRegenerating(false);
      }
    })();
  }, [last?.graph, projectId, setLast, setEditedYaml, setRegenerating]);

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

  async function openSuggestions() {
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
          ...headers(),
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
  }

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
        setGraphRegenerating(true);
        setGraphVersion((v) => v + 1);
        await refetchVersions();
        setVersionsRefreshTrigger((t) => t + 1);
        setTimeout(() => setGraphRegenerating(false), 400);
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
    <div className="space-y-6 max-w-400 mx-auto flex flex-col pb-6 min-w-0 w-full overflow-x-hidden">
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

      <SuggestionModal
        open={open}
        loading={loadingSug}
        suggestions={sugs}
        error={err}
        onClose={() => setOpen(false)}
        onApply={applySuggestions}
        applyLoading={applyLoading}
        disabledApply={!hasDetections || loadingSug}
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

      <div className="sticky top-0 z-20 p-3 shadow-xl shadow-black/20 overflow-hidden shrink-0 pointer-events-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto [&_select]:pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-white/10">
          <VersionSidebar
            refreshTrigger={versionsRefreshTrigger}
            projectId={projectId}
          />

          <button
            type="button"
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
              onClick={handleReturnToChat}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
            >
              Return to Chat
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <Legend versionCount={versionCount ?? undefined} />

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setSimulationModalOpen(true)}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
            >
              Proceed to Performance Simulator
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card/80 backdrop-blur-sm shadow-xl shadow-black/20 overflow-hidden flex flex-col min-w-0">
        {showGraphOverlay ? (
          <div className="relative flex-1 min-h-[50vh] flex items-center justify-center bg-black/30">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#9AA4B2] border-t-transparent" />
              <span className="text-sm font-medium text-white/90">
                Regenerating graph…
              </span>
              <span className="text-xs text-white/50">
                {regenerating
                  ? "Loading YAML, building graph, and detecting anti-patterns"
                  : "Applying fixes and updating visualization"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <GraphCanvas
              key={`amg-apd-graph-v${graphVersion}`}
              data={last}
              isGenerating={regenerating}
              onExportImageReady={(fn) => {
                exportImageRef.current = fn;
              }}
              onExportGraphJsonReady={(getGraph) => {
                exportGraphJsonRef.current = getGraph;
              }}
              onDuplicateName={(name) => setDuplicateNameForModal(name)}
              onGenerateGraph={async (yaml, nodeLayout) => {
                setRegenerating(true);
                try {
                  const data = await analyzeAndSaveAsNewVersion(
                    yaml,
                    undefined,
                    nodeLayout,
                  );
                  setLast(data);
                  setEditedYaml(yaml);
                  setGraphVersion((v) => v + 1);
                  await refetchVersions();
                  setVersionsRefreshTrigger((t) => t + 1);
                  showToast("Graph generated successfully", "success");
                } catch (err: any) {
                  showToast(
                    "Failed to generate graph: " +
                      (err?.message ?? "Unknown error"),
                    "error",
                  );
                } finally {
                  setRegenerating(false);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
