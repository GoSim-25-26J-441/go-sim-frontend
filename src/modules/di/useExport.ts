// src/modules/di/useExport.ts
"use client";

import { useSession } from "@/modules/session/context";

type ExportOpts = {
  download?: boolean;                 
  filename?: string;                 
};

function downloadText(text: string, filename: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useExport(jobId: string | null | undefined) {
  const { userId } = useSession();

  async function exportYaml(opts?: ExportOpts) {
    if (!jobId) throw new Error("Missing jobId");

    const r = await fetch(
      `/api/di/jobs/${jobId}/export?format=yaml&download=false`,
      { headers: { "x-user-id": userId } }
    );
    if (!r.ok) throw new Error(`Export YAML failed: ${r.status}`);
    const yamlText = await r.text();

    if (opts?.download) {
      downloadText(yamlText, opts.filename || `gosim-${jobId}.yaml`, "text/yaml");
    }
    return yamlText;
  }

  async function exportJson(opts?: ExportOpts) {
    if (!jobId) throw new Error("Missing jobId");
    const r = await fetch(
      `/api/di/jobs/${jobId}/export?format=json&download=false`,
      { headers: { "x-user-id": userId } }
    );
    if (!r.ok) throw new Error(`Export JSON failed: ${r.status}`);
    const spec = await r.json();

    if (opts?.download) {
      downloadText(JSON.stringify(spec, null, 2), opts.filename || `gosim-${jobId}.json`, "application/json");
    }
    return spec;
  }

  return { exportYaml, exportJson };
}
