"use client";

import { use } from "react";
import CostPage from "@/app/(dashboard)/cost/page";

export default function ProjectCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return <CostPage projectId={id} />;
}
