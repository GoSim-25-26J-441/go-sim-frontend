/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { diFetch, readJsonSafe } from "../_lib/backend";

export async function POST(req: Request) {
  const inForm = await req.formData();
  const file = inForm.get("files");
  const hint = inForm.get("chat");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "files is required" }, { status: 400 });
  }

  const out = new FormData();
  out.append("files", file, (file as any)?.name || "upload");
  if (typeof hint === "string" && hint.trim()) out.append("chat", hint.trim());

  const r = await diFetch("/ingest", { method: "POST", body: out });

  const parsed = await readJsonSafe(r);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "backend non-JSON response" }, { status: 502 });
  }
  return NextResponse.json(parsed.json, { status: r.status });
}
