import { NextResponse } from "next/server";
import { diFetch, readJsonSafe } from "../_lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await diFetch("/jobs", { method: "GET" });

  const parsed = await readJsonSafe(r);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: `backend ${r.status}: ${parsed.ok ? JSON.stringify(parsed.json) : parsed.text}` },
      { status: 502 }
    );
  }
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "backend non-JSON response" }, { status: 502 });
  }

  const jobs = (parsed.json?.jobs || []) as string[];
  const chats = jobs.map((jobId) => ({ jobId, title: jobId, lastAt: null, lastBy: null }));
  return NextResponse.json({ ok: true, chats });
}
