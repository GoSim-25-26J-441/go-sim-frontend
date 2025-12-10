// src/modules/di/api.ts
// keep your existing HistoryMsg + getHistory in chatClient.ts

export type ChatReply = {
  ok: boolean;
  answer: string;
  source?: "rag" | "llm" | "sizing-prompts" | "guardrails";
  signals?: {
    rps_peak?: number | null;
    rps_avg?: number | null;
    latency_p95_ms?: number | null;
    payload_kb?: number | null;
    burst_factor?: number | null;
    cpu_vcpu?: number | null;
  };
};

export async function send(
  jobId: string,
  message: string,
  opts?: { mode?: string; forceLLM?: boolean },
): Promise<ChatReply> {
  const body: Record<string, unknown> = { message };
  if (opts?.mode) body.mode = opts.mode;
  if (opts?.forceLLM) body.force_llm = true;

  const res = await fetch(`/api/di/jobs/${jobId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ChatReply;
}
