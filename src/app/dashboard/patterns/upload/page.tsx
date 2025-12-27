"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const setLast = useAmgApdStore((s) => s.setLast);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
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

      // quick safety check – if backend didn't send a graph, don't proceed
      if (!data || !data.graph) {
        throw new Error("Backend did not return a graph in the response.");
      }

      // store in Zustand (which is also persisted to sessionStorage)
      setLast(data);

      // debug helper in case we need to inspect later
      if (typeof window !== "undefined") {
        console.log("AnalysisResult from backend:", data);
      }

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
                We&apos;re parsing your YAML data, building the service graph,
                and running anti-pattern detectors.
              </p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border border-slate-400 border-t-transparent" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="relative h-48 rounded-md bg-slate-50 overflow-hidden">
              <div className="absolute inset-0 animate-pulse">
                <div className="absolute left-6 top-8 h-10 w-28 rounded-lg bg-slate-200" />
                <div className="absolute right-10 top-16 h-10 w-32 rounded-lg bg-slate-200" />
                <div className="absolute left-20 bottom-10 h-10 w-28 rounded-lg bg-slate-200" />

                <div className="absolute left-24 top-16 h-[2px] w-24 bg-slate-300" />
                <div className="absolute left-20 top-24 h-[2px] w-40 bg-slate-300" />
                <div className="absolute left-40 bottom-16 h-[2px] w-40 bg-slate-300" />
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="text-[11px] font-semibold uppercase text-slate-700">
                Steps in progress
              </div>
              <ul className="space-y-1.5">
                <li>
                  • Reading YAML file: <strong>{title || "(untitled)"}</strong>
                </li>
                <li>
                  • Building in-memory architecture graph (services & DBs)
                </li>
                <li>• Connecting call paths and data flows</li>
                <li>
                  • Running anti-pattern detectors (cycles, god service, etc.)
                </li>
                <li>• Preparing visualization layout</li>
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">
                You will be redirected automatically once the graph is
                generated.
              </p>
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
