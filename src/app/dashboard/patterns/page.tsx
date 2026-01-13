"use client";

import Link from "next/link";
import { useState } from "react";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import SuggestionModal from "@/app/features/amg-apd/components/SuggestionModal";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
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

  const hasDetections = (last?.detections?.length ?? 0) > 0;

  const [open, setOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);

  function handleDownloadYaml() {
    if (!editedYaml) {
      alert(
        "No current YAML found. Upload a YAML or generate one from Edit mode."
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml: editedYaml,
          title: "Architecture",
          out_dir: "/app/out",
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: "ui",
          yaml: editedYaml,
          title: "Architecture",
          out_dir: "/app/out",
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();

      const fixedYaml = data?.fixed_yaml as string | undefined;
      const fixedAnalysis = data?.fixed_analysis as AnalysisResult | undefined;

      if (!fixedYaml || !fixedAnalysis?.graph) {
        throw new Error(
          "Backend did not return fixed_yaml / fixed_analysis.graph"
        );
      }

      setEditedYaml(fixedYaml);
      setLast(fixedAnalysis);

      setSugs((data?.applied_fixes ?? []) as Suggestion[]);

      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to apply suggestions");
    } finally {
      setApplyLoading(false);
    }
  }

  if (!last?.graph) {
    return (
      <div className="p-6 space-y-3">
        <div>No graph to display. Upload a YAML and run analysis.</div>
        <Link
          className="text-blue-600 underline"
          href="/dashboard/patterns/upload"
        >
          Upload a YAML to analyze →
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            Graph Visualization with Anti-Patterns
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openSuggestions}
            disabled={!hasDetections || !editedYaml}
            className="rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
            title={
              !editedYaml
                ? "No current YAML available"
                : hasDetections
                ? "View suggestions to fix detected anti-patterns"
                : "No anti-patterns detected"
            }
          >
            View suggestions
          </button>

          <button
            type="button"
            onClick={handleDownloadYaml}
            className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Download current YAML
          </button>

          <Legend />
        </div>
      </div>

      <GraphCanvas data={last} />
    </div>
  );
}
