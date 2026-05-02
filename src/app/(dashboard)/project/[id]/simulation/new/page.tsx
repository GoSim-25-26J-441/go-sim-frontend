"use client";

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { NewSimulationFlow } from "./NewSimulationFlow";

export default function ProjectNewSimulationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string | undefined;

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project ID missing in URL.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}/simulation`)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
            aria-label="Back to simulation runs"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="flex items-center gap-2 text-md font-bold text-white">
            New simulation
          </h1>
        </div>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <NewSimulationFlow
          projectId={projectId}
          versionQueryParam={searchParams.get("version")}
          urlSearchParamsSerialized={searchParams.toString()}
          embedMode={false}
        />
      </div>
    </div>
  );
}
