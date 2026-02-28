import type { NextRequest } from "next/server";
import { diFetch, getTokenFromRequest } from "../../../_lib/backend";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  const token = getTokenFromRequest(req);
  const r = await diFetch(
    `/jobs/${encodeURIComponent(id)}/export${url.search}`,
    { method: "GET" },
    { token }
  );

  const body = await r.text();

  return new Response(body, {
    status: r.status,
    headers: {
      "content-type":
        r.headers.get("content-type") ??
        (format === "yaml"
          ? "text/yaml; charset=utf-8"
          : "application/json; charset=utf-8"),
    },
  });
}
