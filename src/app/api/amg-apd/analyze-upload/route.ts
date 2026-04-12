/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../headers";

const BASE = process.env.BACKEND_BASE ?? "http://localhost:8080";

export async function GET() {
  return NextResponse.json({ ok: true, where: "next: analyze-upload" });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string) || "Uploaded";

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const yamlText = await file.text();
    const backendHeaders = getBackendAmgApdHeaders(req);

    const layoutRaw = form.get("node_layout");
    let node_layout: Record<string, { x: number; y: number }> | undefined;
    if (typeof layoutRaw === "string" && layoutRaw.trim()) {
      try {
        const parsed = JSON.parse(layoutRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          node_layout = parsed as Record<string, { x: number; y: number }>;
        }
      } catch {
        // ignore invalid layout
      }
    }

    const res = await fetch(`${BASE}/api/v1/amg-apd/analyze-raw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...backendHeaders,
      },
      body: JSON.stringify({
        yaml: yamlText,
        title,
        ...(node_layout && Object.keys(node_layout).length > 0
          ? { node_layout }
          : {}),
      }),
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
