// src/app/api/di/jobs/[id]/chat/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const BASE = process.env.DESIGN_INPUT_API_BASE!;
  const KEY  = process.env.DESIGN_INPUT_API_KEY!;
  const uid  = (await cookies()).get("uid")?.value || "demo-user";
  const body = await req.text();

  const r = await fetch(`${BASE}/jobs/${params.id}/chat`, {
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
  return NextResponse.json(JSON.parse(text));
}
