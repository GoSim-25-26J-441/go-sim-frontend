import { diFetch, readJsonSafe } from "@/app/api/di/_lib/backend";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const r = await diFetch(`/jobs/${encodeURIComponent(id)}/chat/history`, {
    method: "GET",
  });

  const parsed = await readJsonSafe(r);

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: `backend ${r.status}: ${parsed.ok ? JSON.stringify(parsed.json) : parsed.text}` },
      { status: 502 }
    );
  }

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "backend returned non-JSON" }, { status: 502 });
  }

  return NextResponse.json(parsed.json, { status: r.status });
}
