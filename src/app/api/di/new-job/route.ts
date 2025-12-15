/* eslint-disable @typescript-eslint/no-explicit-any */
// Node runtime is fine; this route proxies to your backend to create a job
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

const BASE = process.env.DESIGN_INPUT_API_BASE!; // e.g. http://localhost:8080/api/v1/design-input
const KEY  = process.env.DESIGN_INPUT_API_KEY!;

export async function POST(req: Request) {
  try {
    const hdrs = await headers();
    const uidFromHdr = hdrs.get("x-user-id") || "";
    const uidFromCookie = (await cookies()).get("uid")?.value || "";
    const userId = uidFromHdr || uidFromCookie || "demo-user";

    // Create a tiny placeholder file so /ingest succeeds without user upload
    const fd = new FormData();
    const blob = new Blob(["placeholder job"], { type: "text/plain" });
    fd.append("files", blob, "placeholder.txt");

    const r = await fetch(`${BASE}/ingest`, {
      method: "POST",
      headers: {
        "X-API-Key": KEY,
        "X-User-Id": userId,
      },
      body: fd,
    });

    // Pass through backend JSON (or error json) as-is
    const text = await r.text();
    let json: any;
    try { json = JSON.parse(text); } catch {
      return NextResponse.json(
        { ok: false, error: `backend non-JSON: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    return NextResponse.json(json, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
