"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PatternsView from "@/app/features/amg-apd/components/PatternsView";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { useReturnToChatFromPatterns } from "@/modules/di/useReturnToChatFromPatterns";

export default function ProjectPatternsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { returnToChat, returning } = useReturnToChatFromPatterns(projectId);
  const patternsGraphFullscreen = useAmgApdStore(
    (s) => s.patternsGraphFullscreen,
  );

  return (
    <div
      className={
        patternsGraphFullscreen
          ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          : "min-w-0 space-y-4 p-6"
      }
    >
      {!patternsGraphFullscreen && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push(`/project/${projectId}/summary`)}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-black/80 bg-white transition-all duration-150 hover:bg-white/80 hover:text-black/80"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-md flex items-center gap-2 font-bold text-white">
              Architecture Model Generator & Anti-Pattern Detector
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void returnToChat()}
            className="flex items-center gap-2 rounded-md bg-emerald-600/80 px-2 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-emerald-500"
          >
            {returning ? "Opening chat…" : "Return to Chat"}
          </button>
        </div>
      )}

      <div
        className={
          patternsGraphFullscreen
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            : "min-w-0"
        }
      >
        <PatternsView
          projectId={projectId}
          onReturnToChat={() => returnToChat()}
          stickyToolbar={false}
        />
      </div>
    </div>
  );
}
