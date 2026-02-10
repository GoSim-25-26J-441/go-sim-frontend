"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type { AmgApdVersionSummary, AnalysisResult } from "@/app/features/amg-apd/types";

export default function VersionSidebar() {
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);

  async function fetchVersions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amg-apd/versions", {
        headers: getAmgApdHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setVersions(data?.versions ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load versions");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVersions();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function handleMoveToVersion(id: string) {
    setOpen(false);
    setRegenerating(true);
    try {
      const versionRes = await fetch(`/api/amg-apd/versions/${id}`, {
        headers: getAmgApdHeaders(),
      });
      if (!versionRes.ok) throw new Error(await versionRes.text());
      const v = await versionRes.json();
      const yamlContent = v?.yaml_content;
      if (!yamlContent) throw new Error("Version has no YAML content");

      const blob = new Blob([yamlContent], { type: "text/yaml" });
      const fd = new FormData();
      fd.append("file", blob, "architecture.yaml");
      fd.append("title", v.title || `Version ${v.version_number ?? ""}`);

      const analyzeRes = await fetch("/api/amg-apd/analyze-upload", {
        method: "POST",
        headers: getAmgApdHeaders(),
        body: fd,
      });
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text());

      const data: AnalysisResult = await analyzeRes.json();
      if (!data?.graph) throw new Error("Backend did not return a graph.");

      setLast(data);
      setEditedYaml(yamlContent);
    } catch (e: any) {
      alert("Failed to load version: " + (e?.message ?? "Unknown error"));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this version? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/amg-apd/versions/${id}`, {
        method: "DELETE",
        headers: getAmgApdHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchVersions();
    } catch (e: any) {
      alert("Failed to delete: " + (e?.message ?? "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface transition-colors flex items-center gap-2"
        title="View and switch versions"
      >
        <span>Versions</span>
        {versions.length > 0 && (
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700 min-w-[1.25rem] text-center">
            {versions.length}
          </span>
        )}
        <span className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase text-slate-600">Versions</span>
            <Link
              href="/dashboard/patterns/compare"
              className="text-xs text-blue-600 hover:underline font-medium"
              onClick={() => setOpen(false)}
            >
              Compare
            </Link>
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-2">
            {loading && (
              <div className="text-xs text-slate-500 py-3 text-center">Loading…</div>
            )}
            {error && (
              <div className="text-xs text-red-600 py-2 px-2">{error}</div>
            )}
            {!loading && !error && versions.length === 0 && (
              <div className="text-xs text-slate-500 py-3 text-center">
                No versions yet. Upload & analyze to create one.
              </div>
            )}

            <ul className="space-y-1">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 text-xs"
                >
                  <div className="font-medium text-slate-800 truncate" title={v.title}>
                    #{v.version_number} {v.title || "Untitled"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatDate(v.created_at)}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => handleMoveToVersion(v.id)}
                      className="rounded bg-slate-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-800"
                    >
                      Move to this version
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      disabled={deletingId === v.id}
                      className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50"
                      title="Delete version"
                    >
                      {deletingId === v.id ? (
                        <span className="inline-block w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "Delete"
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
