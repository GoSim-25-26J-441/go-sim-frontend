import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../headers";

const BASE = process.env.BACKEND_BASE ?? "http://localhost:8080";

/** POST /api/amg-apd/update-version-analysis - run analysis and update existing version in place */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const versionId = body?.version_id;
    const yaml = body?.yaml ?? "";
    const node_layout = body?.node_layout;

    if (!versionId) {
      return NextResponse.json({ error: "version_id is required" }, { status: 400 });
    }

    const backendHeaders = getBackendAmgApdHeaders(req);
    const payload: Record<string, unknown> = { version_id: versionId, yaml };
    if (
      node_layout &&
      typeof node_layout === "object" &&
      !Array.isArray(node_layout) &&
      Object.keys(node_layout as object).length > 0
    ) {
      payload.node_layout = node_layout;
    }

    const res = await fetch(`${BASE}/api/v1/amg-apd/update-version-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...backendHeaders,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "update-version-analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
