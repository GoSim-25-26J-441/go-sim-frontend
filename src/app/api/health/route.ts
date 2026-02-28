import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = () =>
  process.env.BACKEND_BASE || process.env.NEXT_PUBLIC_BACKEND_BASE;

/**
 * Health check endpoint - does NOT require auth.
 * Used by ConnectionMonitor to detect server/backend availability without triggering 401.
 */
export async function GET() {
  const base = BACKEND();
  if (!base) {
    return NextResponse.json({ ok: false, error: "Missing BACKEND_BASE" }, { status: 500 });
  }

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/v1/projects`, {
      method: "GET",
      cache: "no-store",
      headers: {},
    });
    // Any response (including 401 Unauthorized) means backend is reachable
    if (res.status !== 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Backend offline" }, { status: 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "Backend offline" }, { status: 502 });
  }
}
