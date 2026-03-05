"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import SuggestionModal, {
  type Suggestion,
} from "@/app/features/amg-apd/components/SuggestionModal";
import VersionSidebar from "@/app/features/amg-apd/components/VersionSidebar";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type {
  AnalysisResult,
  AmgApdVersionSummary,
} from "@/app/features/amg-apd/types";

export default function PatternsPage() {
  const last = useAmgApdStore((s) => s.last);
  const editedYaml = useAmgApdStore((s) => s.editedYaml);
  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const regenerating = useAmgApdStore((s) => s.regenerating);

  const [open, setOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [graphRegenerating, setGraphRegenerating] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);
  const [versionCount, setVersionCount] = useState<number | null>(null);
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [simulationSelectedVersion, setSimulationSelectedVersion] =
    useState("");

  const restoreStartedRef = useRef(false);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);

  const hasDetections = (last?.detections?.length ?? 0) > 0;
  const showGraphOverlay = graphRegenerating || regenerating;

  // When there's no graph (e.g. first visit or "View Existing Versions"), load latest version directly (no new version created)
  useEffect(() => {
    if (last?.graph || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    setRegenerating(true);

    (async () => {
      try {
        const listRes = await fetch("/api/amg-apd/versions", {
          headers: getAmgApdHeaders(),
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
          headers: getAmgApdHeaders(),
        });
        if (!versionRes.ok) return;

        const v = await versionRes.json();
        const graph = v?.graph;
        const yamlContent = v?.yaml_content;
        if (!graph || !yamlContent) return;

        // Use version data directly - do NOT call analyze-upload (that creates a new version)
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
        // Leave graph empty; user will see "No graph to display"
      } finally {
        setRegenerating(false);
      }
    })();
  }, [last?.graph, setLast, setEditedYaml, setRegenerating, setRegenerating]);

  useEffect(() => {
    if (!last?.graph) return;
    (async () => {
      try {
        const res = await fetch("/api/amg-apd/versions", {
          headers: getAmgApdHeaders(),
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
  }, [last?.graph]);

  function handleReturnToChat() {
    alert("Button is clicked");
  }

  function handleSimulationConfirm() {
    alert("Button is clicked");
    setSimulationModalOpen(false);
    setSimulationSelectedVersion("");
  }

  function handleDownloadYaml() {
    if (!editedYaml) {
      alert(
        "No current YAML found. Upload a YAML or generate one from Edit mode.",
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
  }

  async function openSuggestions() {
    if (!editedYaml) {
      alert("No current YAML available. Upload a YAML first.");
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
          ...getAmgApdHeaders(),
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
      alert("No current YAML available.");
      return;
    }

    setApplyLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/amg-apd/apply-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAmgApdHeaders(),
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

      setEditedYaml(fixedYaml);
      setLast(fixedAnalysis);
      setSugs((data?.applied_fixes ?? []) as Suggestion[]);
      setOpen(false);

      // Show regenerating state and force graph remount
      setGraphRegenerating(true);
      setGraphVersion((v) => v + 1);

      // Brief delay so user sees "Regenerating graph..." before fresh render
      setTimeout(() => setGraphRegenerating(false), 400);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to apply suggestions");
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
          <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
            Upload a YAML and run analysis to visualize your architecture.
          </p>
          <Link
            href="/dashboard/patterns/upload"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#9AA4B2] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#9AA4B2]/20 hover:bg-[#9AA4B2]/90 hover:shadow-[#9AA4B2]/30 transition-all duration-200 hover:scale-[1.02]"
          >
            Upload YAML to Analyze
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Simulation modal */}
      {simulationModalOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget && setSimulationModalOpen(false)
          }
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 shadow-2xl"
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
                className="rounded-lg border border-white/15 bg-gray-800 px-4 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50"
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
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulationConfirm}
                disabled={!simulationSelectedVersion}
                className="rounded-lg bg-[#9AA4B2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9AA4B2]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* Top panel */}
      <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm p-4 shadow-xl shadow-black/20 overflow-hidden">
        {/* Title row: title + Return to Chat (moved up next to title) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h1 className="text-lg font-semibold text-white/95">
            Architecture Model & Anti-Pattern Detector
          </h1>

          <button
            type="button"
            onClick={handleReturnToChat}
            className="rounded-2xl border border-white/15 bg-card/80 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
          >
            Return to Chat
          </button>
        </div>

        {/* Controls row: move remaining buttons left */}
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-white/10">
          <VersionSidebar />

          <button
            type="button"
            onClick={openSuggestions}
            disabled={!hasDetections || !editedYaml}
            className="rounded-2xl border border-white/15 bg-surface/80 px-5 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
            className="rounded-2xl border border-white/15 bg-card/80 px-5 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
          >
            Download YAML
          </button>
        </div>

        {/* Legend + Proceed button row:
            - Proceed button moved to the RIGHT side
            - Positioned lower so it sits parallel with the Legend (node types + anti-patterns)
        */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-3">
          <Legend versionCount={versionCount ?? undefined} />

          <div className="lg:flex-shrink-0 lg:self-end">
            <button
              type="button"
              onClick={() => setSimulationModalOpen(true)}
              className="w-full lg:w-auto rounded-2xl bg-[#0d307c] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2563eb]/30 hover:bg-[#1d4ed8] transition-all duration-200"
            >
              Proceed to Performance Simulation
            </button>
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-sm shadow-xl shadow-black/20 overflow-hidden">
        {showGraphOverlay ? (
          <div className="relative h-[60vh] flex items-center justify-center bg-black/30">
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
          <GraphCanvas key={`amg-apd-graph-v${graphVersion}`} data={last} />
        )}
      </div>
    </div>
  );
}
