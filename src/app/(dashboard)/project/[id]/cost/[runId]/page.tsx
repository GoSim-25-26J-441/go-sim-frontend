"use client";

import { use } from "react";
import { CostRunDetail } from "@/app/(dashboard)/cost/[id]/page";

export default function ProjectCostRunDetailPage({
    params,
}: {
    params: Promise<{ id: string; runId: string }>;
}) {
    const { id: projectId, runId } = use(params);
    return <CostRunDetail requestId={runId} projectId={projectId} />;
}
