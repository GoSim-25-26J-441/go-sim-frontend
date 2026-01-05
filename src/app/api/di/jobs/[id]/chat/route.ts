import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(
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

  // cookies() is synchronous; also allow header override
  const store = cookies();
  const uid = req.headers.get("x-user-id") || (await store).get("uid")?.value || "demo-user";

  const body = await req.text();

  const upstream = `${BASE}/jobs/${encodeURIComponent(id)}/chat`;
  const r = await fetch(upstream, {
    method: "POST",
    headers: {
      "X-API-Key": KEY,
      "X-User-Id": uid,
      "content-type": "application/json",
    },
    body,
  });

  const text = await r.text();

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: `backend ${r.status}: ${text}` },
      { status: 502 }
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
