/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/providers/auth-context";
import {
  AMG_APD_VERSIONS_API_BASE,
  getAmgApdHeaders,
} from "@/app/features/amg-apd/api/amgApdClient";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { useToast } from "@/hooks/useToast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type {
  AmgApdVersionSummary,
  AnalysisResult,
} from "@/app/features/amg-apd/types";
import { PenLine, Trash } from "lucide-react";
import { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";

export default function VersionSidebar({
  refreshTrigger = 0,
  projectId,
  designerTourForceOpenNonce = 0,
}: {
  refreshTrigger?: number;
  /** When provided, all API calls use this as X-Chat-Id for project-scoped versions */
  projectId?: string;
  /** Incremented by the designer tour to open the versions menu */
  designerTourForceOpenNonce?: number;
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
  const [confirmDeleteVersionId, setConfirmDeleteVersionId] = useState<
    string | null
  >(null);
  const [lastVersionBlockOpen, setLastVersionBlockOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);

  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);
  const setRegenerating = useAmgApdStore((s) => s.setRegenerating);
  const commitGraphBaseline = useAmgApdStore((s) => s.commitGraphBaseline);
  const patternsGuidesEnabled = useAmgApdStore((s) => s.patternsGuidesEnabled);
  const showToast = useToast((s) => s.showToast);

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
      const res = await fetch(AMG_APD_VERSIONS_API_BASE, {
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

  useEffect(() => {
    if (!designerTourForceOpenNonce) return;
    setOpen(true);
    requestAnimationFrame(() => updatePosition());
  }, [designerTourForceOpenNonce, updatePosition]);

  async function handleMoveToVersion(id: string) {
    setOpen(false);
    setRegenerating(true);
    try {
      const versionRes = await fetch(
        `${AMG_APD_VERSIONS_API_BASE}/${encodeURIComponent(id)}`,
        { headers: headers() },
      );
      if (!versionRes.ok) throw new Error(await versionRes.text());
      const v = await versionRes.json();
      const yamlContent = v?.yaml_content;
      const graph = v?.graph;
      if (!yamlContent || !graph)
        throw new Error("Version has no YAML or graph content");

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
      commitGraphBaseline();
      showToast("Switched to version successfully", "success");
    } catch (e: any) {
      showToast(
        "Failed to load version: " + (e?.message ?? "Unknown error"),
        "error",
      );
    } finally {
      setRegenerating(false);
    }
  }

  /** Only `amg_apd` (or legacy empty) rows can be removed via this API; `canvas_json` v1 stays. */
  function versionCanDeleteFromList(v: AmgApdVersionSummary) {
    const s = v.source?.trim();
    return !s || s === "amg_apd";
  }

  async function handleDelete(id: string) {
    const row = versions.find((x) => x.id === id);
    if (row && !versionCanDeleteFromList(row)) {
      showToast(
        "This version is the main diagram snapshot; it cannot be removed from this list.",
        "info",
      );
      return;
    }
    if (versions.length <= 1) {
      setLastVersionBlockOpen(true);
      return;
    }
    setConfirmDeleteVersionId(id);
  }

  async function confirmDeleteVersion() {
    const id = confirmDeleteVersionId;
    if (!id) return;
    setConfirmDeleteVersionId(null);
    setDeletingId(id);
    try {
      const res = await fetch(
        `${AMG_APD_VERSIONS_API_BASE}/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: headers() },
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchVersions();
      showToast("Version deleted successfully", "success");
    } catch (e: any) {
      showToast(
        "Failed to delete version: " + (e?.message ?? "Unknown error"),
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function startRename(v: AmgApdVersionSummary) {
    setEditingId(v.id);
    setEditingTitle(
      v.title || `diagramV${v.version_number}`,
    );
  }

  async function saveRename() {
    if (!editingId || !editingTitle.trim()) {
      setEditingId(null);
      return;
    }
    setSavingTitleId(editingId);
    try {
      const renameUrl = `${AMG_APD_VERSIONS_API_BASE}/${encodeURIComponent(editingId)}`;
      const renameInit = {
        headers: {
          "Content-Type": "application/json",
          ...headers(),
        },
        body: JSON.stringify({ title: editingTitle.trim() }),
      };
      let res = await fetch(renameUrl, { method: "PATCH", ...renameInit });
      if (res.status === 405) {
        res = await fetch(renameUrl, { method: "PUT", ...renameInit });
      }
      if (!res.ok) throw new Error(await res.text());
      await fetchVersions();
      setEditingId(null);
      showToast("Version renamed successfully", "success");
    } catch (e: any) {
      showToast(
        "Failed to rename: " + (e?.message ?? "Unknown error"),
        "error",
      );
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
    <div className="relative" data-amg-designer={AMG_DESIGNER.versions}>
      {typeof document !== "undefined" &&
        createPortal(
          <>
            <ConfirmModal
              open={confirmDeleteVersionId !== null}
              onClose={() => setConfirmDeleteVersionId(null)}
              title="Delete version?"
              message="This version will be permanently deleted. This action cannot be undone."
              confirmLabel="Delete"
              cancelLabel="Cancel"
              variant="danger"
              overlayClassName="z-[240000]"
              onConfirm={confirmDeleteVersion}
            />
            <ConfirmModal
              open={lastVersionBlockOpen}
              onClose={() => setLastVersionBlockOpen(false)}
              title="Cannot delete last version"
              message="You must keep at least one version. Create another version before deleting this one."
              confirmLabel="OK"
              variant="warning"
              alertOnly
              overlayClassName="z-[240000]"
              onConfirm={() => setLastVersionBlockOpen(false)}
            />
          </>,
          document.body,
        )}
      <div className="relative inline-flex">
        {versions.length > 0 && !patternsGuidesEnabled && (
          <span
            className="absolute -top-3 -right-3 z-10 inline-flex items-center justify-center min-w-[1rem] h-4 px-1.5 rounded-sm text-[10px] font-semibold tabular-nums bg-red-800 text-white ring-2 ring-black/30"
            aria-label={`${versions.length} version(s)`}
          >
            {versions.length}
          </span>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
          title="View and switch versions"
        >
          Versions
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="versions-dropdown-portal"
            className="fixed z-99999 w-80 overflow-hidden rounded-md border border-white/10 bg-[#1a1a1a] text-white shadow-2xl shadow-black/60"
            style={{ top: position.top, left: position.left }}
          >
            <div
              className="relative flex items-center justify-between gap-2 border-b border-white/[0.08] bg-[#1F1F1F] px-4 py-3"
              data-amg-designer={AMG_DESIGNER.versionCompare}
            >
              <div
                className="pointer-events-none absolute top-0 right-0 left-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
                }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Versions
              </span>
              <Link
                href={
                  projectId
                    ? `/project/${projectId}/patterns/compare`
                    : "/dashboard/patterns/compare"
                }
                className="inline-flex items-center rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
                onClick={closePanel}
              >
                Compare
              </Link>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3">
              {loading && (
                <div className="py-4 text-center text-xs text-white/50">
                  Loading…
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              {!loading && !error && versions.length === 0 && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] py-4 text-center text-xs text-white/50">
                  No versions yet. Upload & analyze to create one.
                </div>
              )}

              <ul className="space-y-2">
                {versions.map((v, idx) => (
                  <li
                    key={v.id}
                    className="rounded-md border border-white/[0.08] bg-[#252525] p-3 text-xs transition-colors hover:border-white/12"
                  >
                    {editingId === v.id ? (
                      <div className="space-y-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-white/45">
                          Rename version
                        </label>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="w-full rounded-md border border-gray-600 bg-[#1F1F1F] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#9AA4B2]/50 focus:outline-none focus:ring-1 focus:ring-[#9AA4B2]/40"
                          placeholder="Version name"
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-2">
                          <button
                            type="button"
                            onClick={() => void saveRename()}
                            disabled={
                              savingTitleId === v.id || !editingTitle.trim()
                            }
                            className="rounded-md border border-gray-600 bg-gray-700/90 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {savingTitleId === v.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="truncate font-medium text-white/90"
                          title={v.title}
                        >
                          #{v.version_number} {v.title || "Untitled"}
                          {v.source === "canvas_json" ? (
                            <span className="ml-1.5 text-[10px] font-normal text-white/45">
                              (canvas)
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[10px] text-white/45">
                          {formatDate(v.created_at)}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            data-amg-designer={
                              idx === 0 ? AMG_DESIGNER.versionMove : undefined
                            }
                            onClick={() => handleMoveToVersion(v.id)}
                            className="min-w-0 flex-1 rounded-md border border-white/12 bg-white px-2 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-gray-200"
                          >
                            Move to this version
                          </button>
                          <button
                            type="button"
                            data-amg-designer={
                              idx === 0
                                ? AMG_DESIGNER.versionRename
                                : undefined
                            }
                            onClick={() => startRename(v)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-white/[0.06] text-white/85 transition-colors hover:border-white/25 hover:bg-white/10"
                            title="Rename this version"
                            aria-label="Rename this version"
                          >
                            <PenLine className="h-3 w-3" aria-hidden />
                          </button>
                          <button
                            type="button"
                            data-amg-designer={
                              idx === 0
                                ? AMG_DESIGNER.versionDelete
                                : undefined
                            }
                            onClick={() => handleDelete(v.id)}
                            disabled={
                              deletingId === v.id ||
                              !versionCanDeleteFromList(v)
                            }
                            title={
                              versionCanDeleteFromList(v)
                                ? "Delete this version"
                                : "The main diagram snapshot cannot be deleted from this list. Save an AMG-APD version first if you need to remove others."
                            }
                            aria-label={
                              versionCanDeleteFromList(v)
                                ? "Delete this version"
                                : "Cannot delete the main diagram snapshot"
                            }
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-red-400/35 bg-red-500/12 text-red-200/95 transition-colors hover:bg-red-500/22 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500/12"
                          >
                            <Trash className="h-3 w-3" aria-hidden />
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
