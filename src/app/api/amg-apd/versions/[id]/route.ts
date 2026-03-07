import { NextRequest, NextResponse } from "next/server";
import { getBackendAmgApdHeaders } from "../../headers";

const BASE =
  process.env.BACKEND_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_BASE ??
  "http://localhost:8080";

/** GET /api/amg-apd/versions/:id - get one version (full) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "version id required" }, { status: 400 });
    }

    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(`${BASE}/api/v1/amg-apd/versions/${id}`, {
      method: "GET",
      headers: backendHeaders,
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
      { error: e?.message ?? "get version failed" },
      { status: 500 }
    );
  }
}

/** DELETE /api/amg-apd/versions/:id */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "version id required" }, { status: 400 });
    }

    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(`${BASE}/api/v1/amg-apd/versions/${id}`, {
      method: "DELETE",
      headers: backendHeaders,
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
      { error: e?.message ?? "delete version failed" },
      { status: 500 }
    );
  }
}

/** PATCH /api/amg-apd/versions/:id - update version (e.g. title) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "version id required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const backendHeaders = getBackendAmgApdHeaders(req);

    const res = await fetch(`${BASE}/api/v1/amg-apd/versions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...backendHeaders,
      },
      body: JSON.stringify(body),
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
      { error: e?.message ?? "update version failed" },
      { status: 500 }
    );
  }
}
