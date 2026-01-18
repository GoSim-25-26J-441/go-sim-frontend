import { NextResponse } from "next/server";
import { diFetch, readJsonSafe } from "../_lib/backend";

export async function POST() {
  const fd = new FormData();
  fd.append("files", new Blob(["placeholder job"], { type: "text/plain" }), "placeholder.txt");

  const r = await diFetch("/ingest", { method: "POST", body: fd });

  const parsed = await readJsonSafe(r);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "backend non-JSON response" }, { status: 502 });
  }
  return NextResponse.json(parsed.json, { status: r.status });
}
