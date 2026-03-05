"use client";

import React, { useState } from "react";
import {
  useGetProjectDiagramImagesQuery,
  useUpdateDiagramImageTitleMutation,
  ProjectDiagramImage,
} from "@/app/store/projectsApi";

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
  const { data, isLoading, isError, refetch } =
    useGetProjectDiagramImagesQuery(projectId, {
      skip: !isOpen || !projectId,
    });
  const [updateTitle, { isLoading: updatingTitle }] =
    useUpdateDiagramImageTitleMutation();
  const [editing, setEditing] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const images = data?.images ?? [];

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl">
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
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">
              Loading images…
            </div>
          )}

          {isError && !isLoading && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Failed to load images. Please try again.
            </div>
          )}

          {!isLoading && !isError && images.length === 0 && (
            <div className="rounded border border-slate-700 bg-slate-900/60 px-3 py-4 text-xs text-slate-400">
              No diagram images found for this project yet. Save a diagram with
              an image to see it here.
            </div>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {images.map((img) => {
                const titleValue =
                  editing[img.id] ?? img.title ?? "(untitled snapshot)";
                return (
                  <div
                    key={img.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded bg-slate-900/60 flex items-center justify-center">
                      <img
                        src={getDiagramImageUrl(img.image_object_key)}
                        alt={img.title || "Diagram snapshot"}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400">
                        Title
                      </label>
                      <input
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-50 outline-none focus:border-sky-500"
                        value={titleValue}
                        onChange={(e) =>
                          handleTitleChange(img.id, e.target.value)
                        }
                        onBlur={() => handleTitleBlur(img)}
                        disabled={updatingTitle}
                      />
                      <p className="text-[10px] text-slate-500">
                        Click to edit. Changes are saved when the field loses
                        focus.
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="font-mono truncate max-w-[60%]">
                        {img.id}
                      </span>
                      {img.created_at && (
                        <span>
                          {new Date(img.created_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

