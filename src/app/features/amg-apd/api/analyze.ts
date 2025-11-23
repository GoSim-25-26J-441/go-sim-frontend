import type { AnalysisResult } from "@/app/features/amg-apd/types";

export async function runAnalyze(body: { path: string; out_dir: string; title: string; }): Promise<AnalysisResult> {
  const res = await fetch("/api/amg-apd/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
