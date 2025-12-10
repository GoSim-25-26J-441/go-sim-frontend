/* eslint-disable @typescript-eslint/no-explicit-any */
// src/modules/design-input/chatClient.ts
export type HistoryMsg = { role: "user" | "assistant" | "rag" | "llm" | "ai"; message: string; ts?: number };

export async function getHistory(jobId: string): Promise<HistoryMsg[]> {
  const res = await fetch(`/api/di/jobs/${jobId}/chat/history`, { cache: "no-store" });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const data = await res.json(); // { ok, history: [{role,text,...}] }
  const arr = Array.isArray(data?.history) ? data.history : [];
  return arr.map((t: any) => ({
    role: (t?.role ?? "assistant") as HistoryMsg["role"],
    message: String(t?.text ?? ""),
    ts: typeof t?.ts === "number" ? t.ts : undefined,
  }));
}
