"use client";

import { useEffect } from "react";
import Link from "next/link";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";

export default function PatternsPage() {
  const last = useAmgApdStore((s) => s.last);
  const setLast = useAmgApdStore((s) => s.setLast);
  const editedYaml = useAmgApdStore((s) => s.editedYaml);

  useEffect(() => {
    if (!last?.graph && typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem("amg_last");
      if (raw) {
        try {
          setLast(JSON.parse(raw));
        } catch {}
      }
    }
  }, [last, setLast]);

  function handleDownloadYaml() {
    if (!editedYaml) {
      alert(
        "No edited YAML file found.\n\nUse Edit mode → Update Changes to generate an edited YAML file."
      );
      return;
    }

    const blob = new Blob([editedYaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "edited-architecture.yaml";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            Graph Vizualization with Anti-Patterns
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Download updated YAML
          </button>
          <Legend />
        </div>
      </div>

      <GraphCanvas data={last} />
    </div>
  );
}
