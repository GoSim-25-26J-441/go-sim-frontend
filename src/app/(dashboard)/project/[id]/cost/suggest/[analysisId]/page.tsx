"use client";

import { use } from "react";
import { ViewMetricsAnalysisContent } from "@/app/(dashboard)/cost/suggest/[id]/page";

export default function ProjectCostSuggestDetailPage({
    params,
}: {
    params: Promise<{ id: string; analysisId: string }>;
}) {
    const { id: projectId, analysisId } = use(params);
    return <ViewMetricsAnalysisContent id={analysisId} projectId={projectId} />;
}
