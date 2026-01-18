/* eslint-disable @typescript-eslint/no-explicit-any */

export type HistoryMsg = {
  role: "user" | "assistant" | "rag" | "llm" | "ai";
  message: string;
  ts?: number;
};

export async function getHistory(jobId: string, userId?: string): Promise<HistoryMsg[]> {
  const res = await fetch(`/api/di/jobs/${jobId}/chat/history`, {
    cache: "no-store",
    headers: userId ? { "x-user-id": userId } : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`history ${res.status}: ${text.slice(0, 200)}`);
  }

  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("history: invalid JSON response");
  }

  const arr = Array.isArray(data?.history) ? data.history : [];
  return arr.map((t: any) => ({
    role: (t?.role ?? "assistant") as HistoryMsg["role"],
    message: String(t?.text ?? t?.message ?? ""),
    ts: typeof t?.ts === "number" ? t.ts : undefined,
  }));
}
