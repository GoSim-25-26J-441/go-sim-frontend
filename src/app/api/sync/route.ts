/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getServerBackendBase } from "@/lib/server-backend-base";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const BACKEND = getServerBackendBase();

  const auth = req.headers.get("authorization") || "";
  const body = await req.text();

  try {
    const upstream = await fetch(`${BACKEND}/api/v1/auth/sync`, {
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
    return NextResponse.json({ error: "Backend offline" }, { status: 502 });
  }
}
