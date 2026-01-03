"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

function decodeSafe(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const setLast = useAmgApdStore((s) => s.setLast);
  const editedYaml = useAmgApdStore((s) => s.editedYaml);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const router = useRouter();
  const searchParams = useSearchParams();

  const regen = searchParams.get("regen") === "1";
  const regenTitleRaw = searchParams.get("title") ?? "Edited architecture";
  const regenTitle = decodeSafe(regenTitleRaw);

  const ranRef = useRef(false);

  useEffect(() => {
    if (!regen) return;
    if (ranRef.current) return;
    ranRef.current = true;

    if (!editedYaml) {
      alert(
        "No edited YAML found.\n\nIf you refreshed this page, the edited YAML in session storage may be gone.\nGo back to the graph and click Generate Graph again."
      );
      router.replace("/dashboard/patterns");
      return;
    }

    setTitle(regenTitle);
    setLoading(true);

    (async () => {
      try {
        const blob = new Blob([editedYaml], { type: "text/yaml" });
        const fd = new FormData();
        fd.append("file", blob, "edited-architecture.yaml");
        fd.append("title", regenTitle || "Edited architecture");
        fd.append("out_dir", "/app/out");

        const res = await fetch("/api/amg-apd/analyze-upload", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Request failed");
        }

        const data: AnalysisResult = await res.json();
        if (!data?.graph) throw new Error("Backend did not return a graph.");

        setLast(data);
        router.replace("/dashboard/patterns");
      } catch (err: any) {
        console.error(err);
        alert("Analyze failed: " + (err?.message ?? "Unknown error"));
        setLoading(false);
      }
    })();
  }, [regen, editedYaml, regenTitle, router, setLast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      const yamlText = await file.text();
      setEditedYaml(yamlText);

      const blob = new Blob([yamlText], { type: "text/yaml" });
      const fd = new FormData();
      fd.append("file", blob, file.name || "architecture.yaml");
      fd.append("title", title || "Uploaded");
      fd.append("out_dir", "/app/out");

      const res = await fetch("/api/amg-apd/analyze-upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Request failed");
      }

      const data: AnalysisResult = await res.json();
      if (!data?.graph) throw new Error("Backend did not return a graph.");

      setLast(data);
      router.push("/dashboard/patterns");
    } catch (err: any) {
      console.error(err);
      alert("Analyze failed: " + (err?.message ?? "Unknown error"));
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 min-h-[calc(100vh-3rem)] flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-600">
                Analyzing architecture…
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Parsing YAML, building the graph, and running detectors.
              </p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border border-slate-400 border-t-transparent" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Upload YAML to begin Analysis</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">
            Architecture spec (YAML)
          </label>
          <input
            type="file"
            accept=".yaml,.yml,text/yaml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Title</label>
          <input
            className="block w-full rounded border p-2"
            value={title}
            placeholder="Enter a Title"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={!file || loading}
        >
          {loading ? "Analyzing…" : "Analyze & Visualize"}
        </button>
      </form>
    </div>
  );
}
