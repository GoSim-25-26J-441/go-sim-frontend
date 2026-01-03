import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_BACKEND_BASE ?? "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${BASE}/api/v1/amg-apd/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "suggestions proxy failed" },
      { status: 500 }
    );
  }
}
