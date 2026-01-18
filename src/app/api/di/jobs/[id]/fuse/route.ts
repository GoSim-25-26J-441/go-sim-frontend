import type { NextRequest } from "next/server";
import { diFetch } from "../../../_lib/backend";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const r = await diFetch(`/jobs/${encodeURIComponent(id)}/fuse`, {
    method: "POST",
  });

  const body = await r.text();

  return new Response(body, {
    status: r.status,
    headers: {
      "content-type":
        r.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
