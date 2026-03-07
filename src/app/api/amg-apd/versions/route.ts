import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../headers";

const BASE =
  process.env.BACKEND_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_BASE ??
  "http://localhost:8080";

/** GET /api/amg-apd/versions - list versions for user/chat */
export async function GET(req: NextRequest) {
  try {
    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(`${BASE}/api/v1/amg-apd/versions`, {
      method: "GET",
      headers: backendHeaders,
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
      { error: e?.message ?? "versions list failed" },
      { status: 500 }
    );
  }
}
