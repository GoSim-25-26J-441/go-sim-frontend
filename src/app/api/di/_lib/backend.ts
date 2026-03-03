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

export type DiFetchOptions = {
  /** When set, forwarded as Authorization header to the design-input backend */
  token?: string | null;
};

/** Extract Bearer token from incoming request for forwarding to backend */
export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  return (auth?.startsWith("Bearer ") ? auth.slice(7) : auth) ?? null;
}

export async function diFetch(
  path: string,
  init?: RequestInit,
  options?: DiFetchOptions
) {
  const KEY = process.env.DESIGN_INPUT_API_KEY;

  if (!KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing env: DESIGN_INPUT_API_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const url = `${getDesignInputBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const outHeaders: Record<string, string> = {};
  if (init?.headers) {
    const h =
      init.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : (init.headers as Record<string, string>);
    Object.assign(outHeaders, h);
  }
  outHeaders["X-API-Key"] = KEY;
  outHeaders["X-User-Id"] = await getUserId();
  if (options?.token) {
    outHeaders["Authorization"] = `Bearer ${options.token}`;
  }

  try {
    return await fetch(url, {
      ...init,
      headers: outHeaders,
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
