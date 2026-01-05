import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const BASE = process.env.DESIGN_INPUT_API_BASE;
  const KEY  = process.env.DESIGN_INPUT_API_KEY;

  if (!BASE || !KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing env: DESIGN_INPUT_API_BASE or DESIGN_INPUT_API_KEY" },
      { status: 500 }
    );
  }

  // cookies() is sync, but keep pattern consistent with your chat route
  const store = cookies();
  const uid =
    req.headers.get("x-user-id") ||
    (await store).get("uid")?.value ||
    "demo-user";

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") ?? "false";

  const upstream =
    `${BASE}/jobs/${encodeURIComponent(id)}/intermediate` +
    `?refresh=${encodeURIComponent(refresh)}`;

  const r = await fetch(upstream, {
    method: "GET",
    headers: {
      "X-API-Key": KEY,
      "X-User-Id": uid,
    },
    cache: "no-store",
  });

  const text = await r.text();

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: `backend ${r.status}: ${text}` },
      { status: 502 }
    );
  }

  // Try JSON first, fall back to raw
  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
