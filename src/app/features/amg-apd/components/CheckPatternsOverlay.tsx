"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import { ArrowLeft, AlertCircle } from "lucide-react";

type Props = {
  projectId: string;
  onClose: () => void;
};

/**
 * Overlay shown on the chat page when "Check Anti-Patterns" is clicked.
 * Blurs the current page and shows a loading card; runs fetch then redirects
 * to patterns or shows error with option to close.
 */
export default function CheckPatternsOverlay({ projectId, onClose }: Props) {
  const router = useRouter();
  const { userId } = useAuth();
  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const projectID = projectId?.trim();
    if (!projectID) {
      setError("Project ID is required.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/amg-apd/projects/${encodeURIComponent(projectID)}/latest`,
          {
            method: "GET",
            headers: getAmgApdHeaders({
              userId: userId ?? undefined,
              chatId: projectID,
            }),
          },
        );

        if (cancelled) return;

        if (!res.ok) {
          const text = await res.text();
          let msg = text || "Failed to load latest version for project";
          try {
            const j = JSON.parse(text);
            if (j?.error) msg = j.error;
          } catch {
            // keep msg
          }
          setError(msg);
          return;
        }

        const data = (await res.json()) as AnalysisResult & {
          yaml_content?: string;
          needs_analysis?: boolean;
          title?: string;
        };

        if (data.needs_analysis && data.yaml_content) {
          // Update existing version in place when version_id is present (e.g. from chat); otherwise create new version.
          const versionId = (data as { version_id?: string }).version_id;
          if (versionId) {
            const updateRes = await fetch("/api/amg-apd/update-version-analysis", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getAmgApdHeaders({
                  userId: userId ?? undefined,
                  chatId: projectID,
                }),
              },
              body: JSON.stringify({
                version_id: versionId,
                yaml: data.yaml_content,
              }),
            });

            if (cancelled) return;

            if (!updateRes.ok) {
              const text = await updateRes.text();
              let msg = text || "Update analysis failed";
              try {
                const j = JSON.parse(text);
                if (j?.error) msg = j.error;
              } catch {
                // keep msg
              }
              setError(msg);
              return;
            }

            const analyzeData: AnalysisResult = await updateRes.json();
            if (!analyzeData?.graph) {
              setError("Backend did not return a graph.");
              return;
            }
            setLast(analyzeData);
            setEditedYaml(data.yaml_content);
            router.replace(`/project/${projectID}/patterns`);
            return;
          }

          // No version_id: create new version via analyze-upload (e.g. first time from patterns).
          const blob = new Blob([data.yaml_content], { type: "text/yaml" });
          const fd = new FormData();
          fd.append("file", blob, "architecture.yaml");
          fd.append("title", data.title || "From project");

          const analyzeRes = await fetch("/api/amg-apd/analyze-upload", {
            method: "POST",
            headers: getAmgApdHeaders({
              userId: userId ?? undefined,
              chatId: projectID,
            }),
            body: fd,
          });

          if (cancelled) return;

          if (!analyzeRes.ok) {
            const text = await analyzeRes.text();
            let msg = text || "Analyze failed";
            try {
              const j = JSON.parse(text);
              if (j?.error) msg = j.error;
            } catch {
              // keep msg
            }
            setError(msg);
            return;
          }

          const analyzeData: AnalysisResult = await analyzeRes.json();
          if (!analyzeData?.graph) {
            setError("Backend did not return a graph.");
            return;
          }
          setLast(analyzeData);
          setEditedYaml(data.yaml_content);
          router.replace(`/project/${projectID}/patterns`);
          return;
        }

        if (!data?.graph) {
          setError("Backend did not return a graph.");
          return;
        }

        setLast(data);
        if (data.yaml_content) {
          setEditedYaml(data.yaml_content);
        }
        router.replace(`/project/${projectID}/patterns`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, userId, router, setLast, setEditedYaml]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Blurred background */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-white/[0.08] bg-[#111]/98 shadow-xl p-5 animate-fade-in-up">
        {error ? (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-400" />
            </div>
            <div className="space-y-3 flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white">
                Could not load patterns
              </h2>
              <p className="text-xs text-white/60 leading-relaxed">{error}</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/project/${projectId}/chat`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Chat
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-white">
                Checking Anti-Patterns
              </p>
              <p className="text-xs text-white/50">
                Loading architecture and running detectors…
              </p>
            </div>
            <div className="w-full h-px bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/15 rounded-full animate-check-patterns-progress"
                style={{ width: "32%" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
