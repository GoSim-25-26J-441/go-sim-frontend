"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
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
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.push(`/project/${projectId}/summary`)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5" />
            Pattern Detection
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Project <span className="font-mono text-xs">{projectId}</span>
          </p>
        </div>
      </div>

      <PatternsView
        projectId={projectId}
        onReturnToChat={() => router.push(`/project/${projectId}/chat`)}
      />
    </div>
  );
}
