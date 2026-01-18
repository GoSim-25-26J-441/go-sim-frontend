/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.BACKEND_BASE ?? "http://localhost:8080";

export async function GET() {
  return NextResponse.json({ ok: true, where: "next: analyze-upload" });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string) || "Uploaded";
    const outDir = (form.get("out_dir") as string) || "/app/out";

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const yamlText = await file.text();

    const res = await fetch(`${BASE}/api/v1/amg-apd/analyze-raw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: yamlText, title, out_dir: outDir }),
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
      { error: e?.message ?? "upload proxy failed" },
      { status: 500 }
    );
  }
}
