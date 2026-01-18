import { NextRequest, NextResponse } from "next/server";
import { diFetch, readJsonSafe } from "../../../_lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") ?? "false";

  const r = await diFetch(
    `/jobs/${encodeURIComponent(id)}/intermediate?refresh=${encodeURIComponent(refresh)}`,
    { method: "GET" }
  );

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
