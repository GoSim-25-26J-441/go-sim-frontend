/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/di/ingest/route.ts
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const BASE = process.env.DESIGN_INPUT_API_BASE;   
  const KEY  = process.env.DESIGN_INPUT_API_KEY;

  if (!BASE || !KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing env: DESIGN_INPUT_API_BASE or DESIGN_INPUT_API_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // read uid from cookie (set by your SessionProvider) or fallbacks
  const cookieUid = (await cookies()).get("uid")?.value;
  const forcedUid = process.env.NEXT_PUBLIC_FORCE_UID;
  const userId = cookieUid || forcedUid || "demo-user";

  // read incoming multipart (file + optional chat hint)
  const inForm = await req.formData();
  const file = inForm.get("files");
  const hint = inForm.get("chat"); // optional

  if (!file || !(file instanceof Blob)) {
    return new Response(
      JSON.stringify({ ok: false, error: "files is required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // forward as multipart to backend
  const out = new FormData();
  out.append("files", file, (file as any)?.name || "upload");
  if (typeof hint === "string" && hint.trim()) out.append("chat", hint.trim());

  const r = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: {
      "X-API-Key": KEY,
      "X-User-Id": userId,
      // do NOT set Content-Type; let fetch set the multipart boundary
    },
    body: out,
    // don’t cache POSTs
  });

  const raw = await r.text();
  let json: any;
  try { json = JSON.parse(raw); } catch { json = { ok: false, error: raw }; }

  return new Response(JSON.stringify(json), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
