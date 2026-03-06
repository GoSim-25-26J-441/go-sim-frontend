/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import {
  useGetProjectDiagramImagesQuery,
  useUpdateDiagramImageTitleMutation,
  ProjectDiagramImage,
} from "@/app/store/projectsApi";
import { X, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { GlobalLoader } from "../loading/GlobalLoader";

type DiagramImagesModalProps = {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
};

const getDiagramImageUrl = (key: string): string => {
  const bucket = "arcfind-includes";
  const region = "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

export function DiagramImagesModal({
  projectId,
  isOpen,
  onClose,
}: DiagramImagesModalProps) {
  const { data, isLoading, isError, refetch } = useGetProjectDiagramImagesQuery(
    projectId,
    { skip: !isOpen || !projectId },
  );
  const [updateTitle, { isLoading: updatingTitle }] =
    useUpdateDiagramImageTitleMutation();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  if (!isOpen) return null;

  const images = data?.images ?? [];
  const focusedImage = focusedIndex !== null ? images[focusedIndex] : null;

  const handleTitleChange = (id: string, value: string) => {
    setEditing((prev) => ({ ...prev, [id]: value }));
  };

  const handleTitleBlur = async (image: ProjectDiagramImage) => {
    const nextTitle = (editing[image.id] ?? image.title ?? "").trim();
    if (!nextTitle || nextTitle === image.title) return;
    try {
      await updateTitle({
        projectId,
        diagramVersionId: image.id,
        title: nextTitle,
      }).unwrap();
      await refetch();
    } catch (e) {
      console.error("Failed to update diagram image title:", e);
    }
  };

  const handlePrev = () => {
    if (focusedIndex === null) return;
    setFocusedIndex((focusedIndex - 1 + images.length) % images.length);
  };

  const handleNext = () => {
    if (focusedIndex === null) return;
    setFocusedIndex((focusedIndex + 1) % images.length);
  };

  const handleFocusKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
    if (e.key === "Escape") setFocusedIndex(null);
  };

  const getDisplayTitle = (img: ProjectDiagramImage) => {
    const base = (editing[img.id] ?? img.title ?? "untitled").trim();
    return base.endsWith(".png") ? base : `${base}.png`;
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md">
        <div className="relative min-h-[50vh] w-full max-w-4xl flex flex-col mx-4 overflow-hidden rounded-md shadow-xl bg-[#1F1F1F]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Diagram &amp; resource images
              </h2>
              <p className="text-[11px] text-slate-400">
                View and edit titles for diagram snapshots stored for this
                project.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-auto p-4">
            {isLoading && (
              <GlobalLoader />
            )}
            {isError && !isLoading && (
              <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                Failed to load images. Please try again.
              </div>
            )}
            {!isLoading && !isError && images.length === 0 && (
              <div className="rounded border border-slate-700 bg-slate-900/60 px-3 py-4 text-xs text-slate-400">
                No diagram images found for this project yet. Save a diagram
                with an image to see it here.
              </div>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, index) => (
                  <button
                    key={img.id}
                    onClick={() => setFocusedIndex(index)}
                    className="group flex flex-col gap-1.5 rounded-sm bg-white p-2 text-left transition-colors focus:outline-none cursor-pointer"
                  >
                    <div
                      className="relative w-full overflow-hidden rounded bg-white flex items-center justify-center hover:bg-white/90"
                      style={{ height: "96px" }}
                    >
                      <img
                        src={getDiagramImageUrl(img.image_object_key)}
                        alt={img.title || "Diagram snapshot"}
                        className="max-h-full max-w-full object-contain transition-opacity group-hover:opacity-80"
                      />
                    </div>
                    <p className="text-[10px] text-black truncate w-full px-0.5">
                      {getDisplayTitle(img)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {focusedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFocusedIndex(null);
          }}
          onKeyDown={handleFocusKeyDown}
          tabIndex={-1}
        >
          <div className="relative w-full max-w-5xl mx-4 flex flex-col rounded-md shadow-2xl bg-[#1F1F1F] overflow-hidden max-h-[92vh]">
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {editingTitleId === focusedImage.id ? (
                    <>
                      <input
                        autoFocus
                        className="w-full max-w-sm rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-50 outline-none focus:border-slate-500 font-semibold"
                        value={
                          editing[focusedImage.id] !== undefined
                            ? editing[focusedImage.id]
                            : (focusedImage.title ?? "")
                        }
                        onChange={(e) =>
                          handleTitleChange(focusedImage.id, e.target.value)
                        }
                        onBlur={() => {
                          handleTitleBlur(focusedImage);
                          setEditingTitleId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleTitleBlur(focusedImage);
                            setEditingTitleId(null);
                          }
                          if (e.key === "Escape") {
                            setEditingTitleId(null);
                          }
                        }}
                        disabled={updatingTitle}
                        placeholder="Enter title…"
                      />
                      <span className="text-[11px] text-slate-500 shrink-0">
                        .png
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-100 max-w-sm">
                          {focusedImage.title?.trim() || "Untitled"}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setEditingTitleId(focusedImage.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          .png
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 mt-0.5">
                  Click the edit icon to rename
                </p>
              </div>

              <button
                onClick={() => setFocusedIndex(null)}
                className="ml-4 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="relative flex items-center justify-center bg-white overflow-hidden"
              style={{ minHeight: "320px", maxHeight: "60vh" }}
            >
              {images.length > 1 && (
                <button
                  onClick={handlePrev}
                  className="absolute left-3 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-[#1F1F1F]/80 text-white hover:bg-[#1F1F1F] border border-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <img
                src={getDiagramImageUrl(focusedImage.image_object_key)}
                alt={focusedImage.title || "Diagram snapshot"}
                className="max-h-full max-w-full object-contain py-4 px-12"
                style={{ maxHeight: "60vh" }}
              />

              {images.length > 1 && (
                <button
                  onClick={handleNext}
                  className="absolute right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-[#1F1F1F]/80 text-white hover:bg-[#1F1F1F] border border-slate-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 shrink-0">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">Project ID</span>
                  <span className="font-mono text-[10px] text-slate-300">
                    {projectId}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">
                    Snapshot ID
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]">
                    {focusedImage.id}
                  </span>
                </div>
                {focusedImage.created_at && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Saved</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(focusedImage.created_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <span className="text-[10px] text-slate-500">
                  {(focusedIndex ?? 0) + 1} / {images.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
