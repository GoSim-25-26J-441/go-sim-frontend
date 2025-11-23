"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Uploaded Spec");
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
      fd.append("title", title);
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
      setLast(data);

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("amg_last", JSON.stringify(data));
      }

      router.push("/dashboard/patterns");
    } catch (err: any) {
      alert("Analyze failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Upload YAML → Analyze</h1>

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
            className="border rounded p-2 block w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!file || loading}
        >
          {loading ? "Analyzing..." : "Analyze & Visualize"}
        </button>
      </form>
    </div>
  );
}
