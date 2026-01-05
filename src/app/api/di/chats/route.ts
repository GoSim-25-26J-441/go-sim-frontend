import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const BASE = process.env.DESIGN_INPUT_API_BASE!;
  const KEY = process.env.DESIGN_INPUT_API_KEY!;
  const uid = (await cookies()).get("uid")?.value || "demo-user";

  const r = await fetch(`${BASE}/jobs`, {
    headers: { "X-API-Key": KEY, "X-User-Id": uid },
    cache: "no-store",
  });

  const text = await r.text();
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: `backend ${r.status}: ${text}` },
      { status: 502 }
    );
  }
  const j = JSON.parse(text) as { ok: boolean; jobs: string[] };

  const chats = (j.jobs || []).map((jobId) => ({
    jobId,
    title: jobId,
    lastAt: null,
    lastBy: null,
  }));

  return NextResponse.json({ ok: true, chats });
}
