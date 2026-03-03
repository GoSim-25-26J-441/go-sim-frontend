/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = () =>
  process.env.BACKEND_BASE || process.env.NEXT_PUBLIC_BACKEND_BASE;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const base = BACKEND();
  if (!base) {
    return NextResponse.json({ error: "Missing BACKEND_BASE" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const auth = req.headers.get("authorization") || "";

  try {
    const body = await req.text();
    const upstream = await fetch(
      `${base.replace(/\/+$/, "")}/api/v1/projects/${encodeURIComponent(id)}/diagram`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth ? { authorization: auth } : {}),
        },
        body: body || undefined,
        cache: "no-store",
      }
    );

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Backend offline" }, { status: 502 });
  }
}
