"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import CheckPatternsLoadingScreen from "@/app/features/amg-apd/components/CheckPatternsLoadingScreen";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { navigateToProjectChatWithDiagram } from "@/modules/di/navigateToProjectChatWithDiagram";

export default function ProjectPatternsCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
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
            // use text as message
          }
          setError(msg);
          return;
        }

        const data: AnalysisResult & { yaml_content?: string } =
          await res.json();
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

  if (error) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center min-h-screen w-full p-6"
        style={{
          background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        }}
      >
        <div className="max-w-md w-full rounded-2xl border border-red-500/20 bg-[#0f172a]/95 backdrop-blur-xl p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h1 className="text-lg font-semibold text-white">
                Could not load patterns
              </h1>
              <p className="text-sm text-white/70">{error}</p>
              <button
                type="button"
                onClick={() =>
                  void navigateToProjectChatWithDiagram(router, projectId)
                }
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-card/80 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Chat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <CheckPatternsLoadingScreen />;
}
