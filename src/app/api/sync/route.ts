/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const BACKEND = process.env.BACKEND_BASE || process.env.NEXT_PUBLIC_BACKEND_BASE;
  if (!BACKEND) {
    return NextResponse.json(
      { error: "Missing BACKEND_BASE environment variable" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const body = await req.text();

  try {
    const upstreamUrl = `${BACKEND}/api/v1/auth/sync`;
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: auth,
      },
      body: body || undefined,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch (e: any) {
    console.error("Backend sync error:", e);
    return NextResponse.json(
      { error: "Backend offline", details: e.message },
      { status: 502 }
    );
  }
}
