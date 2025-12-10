export type HistoryMsg = { role: "user" | "rag" | "llm"; message: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";

function pickArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (isObj(json)) {
    const h = (json as Record<string, unknown>)["history"];
    if (Array.isArray(h)) return h as unknown[];
    const m = (json as Record<string, unknown>)["messages"];
    if (Array.isArray(m)) return m as unknown[];
  }
  return [];
}

type RawMsg = {
  role?: unknown;
  source?: unknown;
  who?: unknown;
  message?: unknown;
  content?: unknown;
  text?: unknown;
};

const isRawMsg = (v: unknown): v is RawMsg =>
  isObj(v) && ("message" in v || "content" in v || "text" in v);

function normalize(v: RawMsg): HistoryMsg {
  const cand =
    (isStr(v.role) && v.role) ||
    (isStr(v.source) && v.source) ||
    (isStr(v.who) && v.who) ||
    "llm";

  const role: HistoryMsg["role"] =
    cand === "user" || cand === "rag" || cand === "llm" ? cand : "llm";

  const message =
    (isStr(v.message) && v.message) ||
    (isStr(v.content) && v.content) ||
    (isStr(v.text) && v.text) ||
    "";

  return { role, message };
}

export async function getHistory(jobId: string): Promise<HistoryMsg[]> {
  const r = await fetch(`/api/di/jobs/${jobId}/chat/history`, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  const json: unknown = await r.json();

  const arr = pickArray(json);
  const out: HistoryMsg[] = [];
  for (const item of arr) if (isRawMsg(item)) out.push(normalize(item));
  return out;
}
