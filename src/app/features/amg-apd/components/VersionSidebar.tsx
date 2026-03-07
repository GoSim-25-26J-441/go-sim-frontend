"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/providers/auth-context";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import type {
  AmgApdVersionSummary,
  AnalysisResult,
} from "@/app/features/amg-apd/types";

export default function VersionSidebar({
  refreshTrigger = 0,
  projectId,
}: {
  refreshTrigger?: number;
  /** When provided, all API calls use this as X-Chat-Id for project-scoped versions */
  projectId?: string;
} = {}) {
  const { userId } = useAuth();
  const headers = () =>
    getAmgApdHeaders({
      userId: userId ?? undefined,
      ...(projectId ? { chatId: projectId } : {}),
    });
  const [versions, setVersions] = useState<AmgApdVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);

  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);

  const closePanel = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      const portal = document.getElementById("versions-dropdown-portal");
      if (portal?.contains(target)) return;
      setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function fetchVersions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amg-apd/versions", {
        headers: headers(),
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
  }, [projectId]);

  useEffect(() => {
    if (refreshTrigger > 0) fetchVersions();
  }, [refreshTrigger, projectId]);

  async function handleMoveToVersion(id: string) {
    setOpen(false);
    setRegenerating(true);
    try {
      const versionRes = await fetch(`/api/amg-apd/versions/${id}`, {
        headers: headers(),
      });
      if (!versionRes.ok) throw new Error(await versionRes.text());
      const v = await versionRes.json();
      const yamlContent = v?.yaml_content;
      const graph = v?.graph;
      if (!yamlContent || !graph) throw new Error("Version has no YAML or graph content");

      // Load this version into the canvas without creating a new version (no analyze-upload).
      const data: AnalysisResult = {
        graph,
        detections: v?.detections ?? [],
        dot_content: v?.dot_content,
        version_id: v?.id,
        version_number: v?.version_number,
        created_at: v?.created_at,
      };

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
        headers: headers(),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchVersions();
    } catch (e: any) {
      alert("Failed to delete: " + (e?.message ?? "Unknown error"));
    } finally {
      setDeletingId(null);
    }
  }

  function startRename(v: AmgApdVersionSummary) {
    setEditingId(v.id);
    setEditingTitle(v.title || `Version ${String(v.version_number).padStart(2, "0")}`);
  }

  async function saveRename() {
    if (!editingId || !editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    setSavingTitleId(editingId);
    try {
      const res = await fetch(`/api/amg-apd/versions/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...headers(),
        },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchVersions();
      setEditingId(null);
    } catch (e: any) {
      alert("Failed to rename: " + (e?.message ?? "Unknown error"));
    } finally {
      setSavingTitleId(null);
    }
  }

  function cancelRename() {
    setEditingId(null);
    setEditingTitle("");
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
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-2xl border border-white/15 bg-card/80 px-5 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 transition-all duration-200 flex items-center gap-2"
        title="View and switch versions"
      >
        <span>Versions</span>
        {versions.length > 0 && (
          <span className="rounded-full bg-[#9AA4B2]/30 px-2 py-0.5 text-xs font-semibold text-white/90 min-w-[1.5rem] text-center">
            {versions.length}
          </span>
        )}
        <span
          className={`text-white/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="versions-dropdown-portal"
            className="fixed z-[99999] w-80 rounded-2xl border border-white/15 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden"
            style={{ top: position.top, left: position.left }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Versions
              </span>
              <Link
                href={
                  projectId
                    ? `/project/${projectId}/patterns/compare`
                    : "/dashboard/patterns/compare"
                }
                className="text-xs text-[#9AA4B2] hover:text-[#9AA4B2]/90 hover:underline font-medium transition-colors"
                onClick={closePanel}
              >
                Compare
              </Link>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3">
              {loading && (
                <div className="text-xs text-white/50 py-4 text-center">
                  Loading…
                </div>
              )}
              {error && (
                <div className="text-xs text-red-400 py-2 px-3 rounded-xl bg-red-500/10">
                  {error}
                </div>
              )}
              {!loading && !error && versions.length === 0 && (
                <div className="text-xs text-white/50 py-4 text-center rounded-xl bg-white/5">
                  No versions yet. Upload & analyze to create one.
                </div>
              )}

              <ul className="space-y-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs hover:bg-white/[0.07] transition-colors"
                  >
                    {editingId === v.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            className="flex-1 rounded-lg border border-white/20 bg-gray-800 px-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#9AA4B2]/50"
                            placeholder="Version name"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void saveRename()}
                            disabled={savingTitleId === v.id || !editingTitle.trim()}
                            className="rounded-lg bg-[#9AA4B2] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#9AA4B2]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingTitleId === v.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="rounded-lg border border-white/20 px-2.5 py-1 text-[10px] text-white/70 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="font-medium text-white/90 truncate"
                          title={v.title}
                        >
                          #{v.version_number} {v.title || "Untitled"}
                        </div>
                        <div className="text-[10px] text-white/50 mt-1">
                          {formatDate(v.created_at)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => handleMoveToVersion(v.id)}
                            className="rounded-lg bg-[rgb(34,76,135)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[rgb(8,38,150)]/90 transition-colors"
                          >
                            Move to this version
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(v)}
                            className="rounded-lg border border-white/20 px-2.5 py-1 text-[10px] text-white/70 hover:bg-white/10 hover:text-white/90 transition-colors"
                            title="Rename version"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(v.id)}
                            disabled={deletingId === v.id}
                            className="rounded-lg border border-white/20 px-2.5 py-1 text-[10px] text-white/70 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50 transition-colors"
                            title="Delete version"
                          >
                            {deletingId === v.id ? (
                              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              "Delete"
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
