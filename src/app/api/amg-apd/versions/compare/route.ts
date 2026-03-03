import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../../headers";

const BASE =
  process.env.BACKEND_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_BASE ??
  "http://localhost:8080";

/** GET /api/amg-apd/versions/compare?left=id&right=id */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const left = searchParams.get("left");
    const right = searchParams.get("right");

    if (!left || !right) {
      return NextResponse.json(
        { error: "query params left and right (version ids) required" },
        { status: 400 }
      );
    }

    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(
      `${BASE}/api/v1/amg-apd/versions/compare?left=${encodeURIComponent(
        left
      )}&right=${encodeURIComponent(right)}`,
      { method: "GET", headers: backendHeaders }
    );

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "compare failed" },
      { status: 500 }
    );
  }
}

/** POST /api/amg-apd/versions/compare body: { left_id, right_id } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const leftId = body?.left_id ?? body?.left;
    const rightId = body?.right_id ?? body?.right;

    if (!leftId || !rightId) {
      return NextResponse.json(
        { error: "body must include left_id and right_id" },
        { status: 400 }
      );
    }

    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(`${BASE}/api/v1/amg-apd/versions/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...backendHeaders,
      },
      body: JSON.stringify({ left_id: leftId, right_id: rightId }),
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
      { error: e?.message ?? "compare failed" },
      { status: 500 }
    );
  }
}
