import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../../../headers";

const BASE =
  process.env.BACKEND_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_BASE ??
  "http://localhost:8080";

/** GET /api/amg-apd/projects/:project_public_id/latest */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ project_public_id: string }> }
) {
  try {
    const { project_public_id } = await params;
    if (!project_public_id) {
      return NextResponse.json(
        { error: "project_public_id required" },
        { status: 400 }
      );
    }

    const backendHeaders = getBackendAmgApdHeaders(req);
    const res = await fetch(
      `${BASE}/api/v1/amg-apd/projects/${encodeURIComponent(
        project_public_id
      )}/latest`,
      {
        method: "GET",
        headers: backendHeaders,
      }
    );

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "latest project version failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

