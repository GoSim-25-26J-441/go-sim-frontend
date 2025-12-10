export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;              
  const BASE = process.env.BACKEND_BASE_URL!;
  const KEY  = process.env.DESIGN_INPUT_API_KEY!;

  const r = await fetch(`${BASE}/jobs/${id}/chat/history`, {
    headers: { "X-API-Key": KEY, "X-User-Id": "demo-user" },
    cache: "no-store",
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
