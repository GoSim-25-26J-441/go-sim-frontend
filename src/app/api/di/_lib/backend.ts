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
  if (!KEY) throw new Error("Missing env: DESIGN_INPUT_API_KEY");

  const userId = await getUserId();
  const url = `${getDesignInputBase()}${path.startsWith("/") ? path : `/${path}`}`;

  const r = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "X-API-Key": KEY,
      "X-User-Id": userId,
    },
    cache: init?.cache ?? "no-store",
  });

  return r;
}

export async function readJsonSafe(r: Response) {
  const text = await r.text();
  try {
    return { ok: true as const, json: JSON.parse(text), text };
  } catch {
    return { ok: false as const, json: null, text };
  }
}
