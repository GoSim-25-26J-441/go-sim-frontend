"use client";

import { useState } from "react";
import { useExport } from "@/modules/di/useExport";

export default function ExportButtons({ jobId }: { jobId: string }) {
  const { exportYaml, exportJson } = useExport(jobId);
  const [busy, setBusy] = useState<null | "yaml" | "json">(null);

  async function handleYaml() {
    if (busy) return;
    try {
      setBusy("yaml");
      await exportYaml({ download: true });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleJson() {
    if (busy) return;
    try {
      setBusy("json");
      await exportJson({ download: true });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={busy !== null}
        onClick={handleYaml}
        className="rounded border border-border px-3 py-1 text-sm
                   hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === "yaml" ? "Preparing YAML…" : "Download YAML"}
      </button>

      <button
        disabled={busy !== null}
        onClick={handleJson}
        className="rounded border border-border px-3 py-1 text-sm
                   hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === "json" ? "Preparing JSON…" : "Download JSON"}
      </button>
    </div>
  );
}
