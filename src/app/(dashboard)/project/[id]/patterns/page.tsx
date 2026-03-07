"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import PatternsView from "@/app/features/amg-apd/components/PatternsView";
import { useReturnToChatFromPatterns } from "@/modules/di/useReturnToChatFromPatterns";

export default function ProjectPatternsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { returnToChat, returning } = useReturnToChatFromPatterns(projectId);

  return (
    <div className="p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-shrink-0 py-4 px-1">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5" />
              Architecture Model Generator & Anti-Pattern Detector
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Project <span className="font-mono text-xs">{projectId}</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => returnToChat()}
          disabled={returning}
          className="flex-shrink-0 rounded-2xl border border-white/15 bg-card/80 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/20 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200"
        >
          {returning ? "Opening chat…" : "Return to Chat"}
        </button>
      </div>

      <div className="min-w-0">
        <PatternsView
          projectId={projectId}
          onReturnToChat={() => returnToChat()}
        />
      </div>
    </div>
  );
}
