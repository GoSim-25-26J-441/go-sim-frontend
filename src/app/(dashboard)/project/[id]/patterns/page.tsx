"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PatternsView from "@/app/features/amg-apd/components/PatternsView";

export default function ProjectPatternsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();

  return (
    <div className="p-6 space-y-4 min-w-0">
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 bg-white text-black hover:bg-white/80 hover:text-black/80 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-md font-bold text-white flex items-center gap-2">
              Architecture Model Generator & Anti-Pattern Detector
            </h1>
          </div>
        </div>
        <button
          onClick={() => router.push(`/project/${projectId}/chat`)}
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-emerald-600/80 hover:bg-emerald-500 text-white"
        >
          Return to Chat
        </button>
      </div>

      <PatternsView
        projectId={projectId}
        onReturnToChat={() => router.push(`/project/${projectId}/chat`)}
      />
    </div>
  );
}
