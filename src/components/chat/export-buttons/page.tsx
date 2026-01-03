"use client";

import { useExport } from "@/modules/di/useExport";


export default function ExportButtons({ jobId }: { jobId: string }) {
  const { exportYaml, exportJson } = useExport(jobId);

  return (
    <div className="flex gap-2">
      <button
        onClick={async () => {
          try {
            await exportYaml({ download: true });
          } catch (e) {
            alert((e as Error).message);
          }
        }}
        className="rounded border border-border px-3 py-1 text-sm hover:bg-surface"
      >
        Download YAML
      </button>

      <button
        onClick={async () => {
          try {
            await exportJson({ download: true });
          } catch (e) {
            alert((e as Error).message);
          }
        }}
        className="rounded border border-border px-3 py-1 text-sm hover:bg-surface"
      >
        Download JSON
      </button>
    </div>
  );
}
