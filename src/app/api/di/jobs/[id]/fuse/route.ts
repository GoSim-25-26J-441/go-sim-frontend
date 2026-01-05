import type { NextRequest } from "next/server";

const API_BASE =
  process.env.DESIGN_INPUT_API_BASE ??
  "http://localhost:8080/api/v1/design-input";

const API_KEY =
  process.env.DESIGN_INPUT_API_KEY ?? "super-secret-key-123";

const FORCE_UID =
  process.env.NEXT_PUBLIC_FORCE_UID ?? "demo-user";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id;

  const backendUrl =
    `${API_BASE}/jobs/${encodeURIComponent(jobId)}/fuse`;

  const res = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "X-User-Id": req.headers.get("x-user-id") ?? FORCE_UID,
    },
    cache: "no-store",
  });

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "content-type":
        res.headers.get("content-type") ??
        "application/json; charset=utf-8",
    },
  });
}
