import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }   // 👈 params is a Promise
) {
  const { id } = await ctx.params;           // 👈 await it

  const base = process.env.DESIGN_INPUT_API_BASE;
  const apiKey = process.env.DESIGN_INPUT_API_KEY;
  if (!base || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing env: DESIGN_INPUT_API_BASE or DESIGN_INPUT_API_KEY" },
      { status: 500 }
    );
  }

  const uid = req.headers.get("x-user-id") || (await cookies()).get("uid")?.value || "demo-user";
  const upstream = `${base}/jobs/${encodeURIComponent(id)}/chat/history`;

  const r = await fetch(upstream, { headers: { "X-API-Key": apiKey, "X-User-Id": uid } });
  const body = await r.text();

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: `backend ${r.status}: ${body}` }, { status: 502 });
  }

  try {
    return NextResponse.json(JSON.parse(body), { status: 200 });
  } catch {
    return new NextResponse(body, { status: 200, headers: { "content-type": "application/json" } });
  }
}
