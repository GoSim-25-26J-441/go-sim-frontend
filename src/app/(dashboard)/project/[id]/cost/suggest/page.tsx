"use client";

import { use } from "react";
import SuggestPage from "@/app/(dashboard)/cost/suggest/page";

export default function ProjectCostSuggestPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: projectId } = use(params);
    return <SuggestPage projectId={projectId} />;
}
