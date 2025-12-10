export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;               // ✅ await params
  const BASE = process.env.BACKEND_BASE_URL!;
  const KEY  = process.env.DESIGN_INPUT_API_KEY!;
  const body = await req.text();

  const r = await fetch(`${BASE}/jobs/${id}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-Key": KEY,
      "X-User-Id": "demo-user",
    },
    body,
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
