"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import SuggestionModal from "@/app/features/amg-apd/components/SuggestionModal";
import VersionSidebar from "@/app/features/amg-apd/components/VersionSidebar";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

type Suggestion = {
  kind: string;
  title: string;
  bullets: string[];
  auto_fix_applied?: boolean;
  auto_fix_notes?: string[];
};

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

  const restoreStartedRef = useRef(false);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);

  const hasDetections = (last?.detections?.length ?? 0) > 0;
  const showGraphOverlay = graphRegenerating || regenerating;

  // When there's no graph (e.g. first visit or "View Existing Versions"), try to load latest version for this user/chat
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
        const versions = listData?.versions ?? [];
        if (versions.length === 0) return;

        const sorted = [...versions].sort(
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
        const yamlContent = v?.yaml_content;
        if (!yamlContent) return;

        const blob = new Blob([yamlContent], { type: "text/yaml" });
        const fd = new FormData();
        fd.append("file", blob, "architecture.yaml");
        fd.append("title", v.title || `Version ${v.version_number ?? ""}`);

        const analyzeRes = await fetch("/api/amg-apd/analyze-upload", {
          method: "POST",
          headers: getAmgApdHeaders(),
          body: fd,
        });
        if (!analyzeRes.ok) return;
        const data: AnalysisResult = await analyzeRes.json();
        if (!data?.graph) return;

        setLast(data);
        setEditedYaml(yamlContent);
      } catch {
        // Leave graph empty; user will see "No graph to display"
      } finally {
        setRegenerating(false);
      }
    })();
  }, [last?.graph, setLast, setEditedYaml, setRegenerating]);
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

  async function applySuggestions() {
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
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Loading your latest version
                </h2>
                <p className="text-sm opacity-70">
                  Fetching YAML, building graph, and detecting anti-patterns…
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">No graph to display</h2>
          <p className="text-sm opacity-70 mb-4">
            Upload a YAML and run analysis to visualize your architecture.
          </p>
          <Link
            href="/dashboard/patterns/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upload YAML to Analyze
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SuggestionModal
        open={open}
        loading={loadingSug}
        suggestions={sugs}
        error={err}
        onClose={() => setOpen(false)}
        onApply={applySuggestions}
        applyLoading={applyLoading}
        disabledApply={!hasDetections || applyLoading || loadingSug}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold mb-1">
              Analyze and visualize your architecture with anti-pattern
              detection
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border">
          <VersionSidebar />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openSuggestions}
              disabled={!hasDetections || !editedYaml}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface transition-colors"
            >
              Download YAML
            </button>

            <Legend />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {showGraphOverlay ? (
          <div className="relative h-[60vh] flex items-center justify-center bg-surface/50">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm font-medium">Regenerating graph…</span>
              <span className="text-xs opacity-70">
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
