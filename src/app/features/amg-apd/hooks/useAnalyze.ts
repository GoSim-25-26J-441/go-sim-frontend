"use client";
import { useQuery } from "@tanstack/react-query";
import { runAnalyze } from "@/app/features/amg-apd/api/analyze";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

export function useAnalyze(args: { path: string; title?: string; out_dir?: string }, enabled = true) {
  const { path, title = "Analysis", out_dir = "/app/out" } = args;
  return useQuery<AnalysisResult>({
    queryKey: ["amg-apd", "analyze", path, title, out_dir],
    queryFn: () => runAnalyze({ path, title, out_dir }),
    enabled,
    staleTime: 0,
  });
}
