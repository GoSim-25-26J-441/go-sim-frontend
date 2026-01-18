/* eslint-disable @typescript-eslint/no-explicit-any */
import { cookies, headers } from "next/headers";

function getBackendBase() {
  const base = process.env.BACKEND_BASE;
  if (!base) throw new Error("Missing env: BACKEND_BASE (or NEXT_PUBLIC_BACKEND_BASE)");
  return base.replace(/\/+$/, "");
}

function getDesignInputBase() {
  return `${getBackendBase()}/api/v1/design-input`;
}

export async function getUserId() {
  const hdrs = await headers();
  const uidFromHdr = hdrs.get("x-user-id") || "";
  const uidFromCookie = (await cookies()).get("uid")?.value || "";
  const forcedUid = process.env.NEXT_PUBLIC_FORCE_UID || "";
  return uidFromHdr || uidFromCookie || forcedUid || "demo-user";
}

export async function diFetch(path: string, init?: RequestInit) {
  const KEY = process.env.DESIGN_INPUT_API_KEY;  

  if (!KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing env: DESIGN_INPUT_API_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const url = `${getDesignInputBase()}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        "X-API-Key": KEY, 
        "X-User-Id": await getUserId(),
      },
      cache: init?.cache ?? "no-store",
    });
  } catch (e: any) {
    const msg = e?.cause?.code
      ? `${e.cause.code} ${e.cause.address || ""}:${e.cause.port || ""}`.trim()
      : String(e?.message || e);

    return new Response(
      JSON.stringify({ ok: false, error: `Backend offline: ${msg}` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}

export async function readJsonSafe(r: Response) {
  const text = await r.text();
  try {
    return { ok: true as const, json: JSON.parse(text), text };
  } catch {
    return { ok: false as const, json: null, text };
  }
}
