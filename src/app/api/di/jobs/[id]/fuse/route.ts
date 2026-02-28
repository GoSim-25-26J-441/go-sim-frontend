import type { NextRequest } from "next/server";
import { diFetch, getTokenFromRequest } from "../../../_lib/backend";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const token = getTokenFromRequest(req);
  const r = await diFetch(
    `/jobs/${encodeURIComponent(id)}/fuse`,
    { method: "POST" },
    { token }
  );

  const body = await r.text();

  return new Response(body, {
    status: r.status,
    headers: {
      "content-type":
        r.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
