"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type { AmgApdVersionSummary } from "@/app/features/amg-apd/types";

export default function VersionSidebar() {
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

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

  async function handleOpen(id: string) {
    try {
      const res = await fetch(`/api/amg-apd/versions/${id}`, {
        headers: getAmgApdHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const v = await res.json();
      if (!v?.graph) throw new Error("Version has no graph");
      setLast({
        graph: v.graph,
        detections: v.detections ?? [],
        dot_content: v.dot_content,
        version_id: v.id,
        version_number: v.version_number,
        created_at: v.created_at,
      });
      if (v.yaml_content) setEditedYaml(v.yaml_content);
    } catch (e: any) {
      alert("Failed to load version: " + (e?.message ?? "Unknown error"));
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
    <div className="rounded-lg border border-border bg-card p-3 min-w-[220px] shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xs font-semibold uppercase opacity-70">
          Versions
        </h2>
        <Link
          href="/dashboard/patterns/compare"
          className="text-xs text-primary hover:underline font-medium"
        >
          Compare
        </Link>
      </div>

      {loading && (
        <div className="text-xs opacity-70 py-2">Loading…</div>
      )}
      {error && (
        <div className="text-xs text-red-600 py-2">{error}</div>
      )}
      {!loading && !error && versions.length === 0 && (
        <div className="text-xs opacity-70 py-2">
          No versions yet. Upload & analyze to create one.
        </div>
      )}

      <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
        {versions.map((v) => (
          <li
            key={v.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2 text-xs hover:bg-surface/80 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => handleOpen(v.id)}
                className="text-left font-medium hover:text-primary truncate block w-full transition-colors"
                title={v.title}
              >
                #{v.version_number} {v.title || "Untitled"}
              </button>
              <div className="text-[10px] opacity-70 mt-0.5">
                {formatDate(v.created_at)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(v.id)}
              disabled={deletingId === v.id}
              className="shrink-0 opacity-60 hover:opacity-100 hover:text-red-600 disabled:opacity-50 transition-all"
              title="Delete version"
            >
              {deletingId === v.id ? (
                <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
              ) : (
                "×"
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
