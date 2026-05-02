import type { NextRequest } from "next/server";

/** Case-insensitive lookup; trims whitespace (matches backend TrimSpace). */
function headerTrimmedCI(req: NextRequest, canonicalLower: string): string | null {
  const direct = req.headers.get(canonicalLower)?.trim();
  if (direct) return direct;
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase() === canonicalLower) {
      const t = v?.trim();
      if (t) return t;
    }
  }
  return null;
}

/**
 * Build headers to forward to AMG-APD backend from incoming request.
 * Only forwards X-User-Id and X-Chat-Id when the client sent them (no defaults).
 */
export function getBackendAmgApdHeaders(
  req: NextRequest,
): Record<string, string> {
  const out: Record<string, string> = {};
  const userId = headerTrimmedCI(req, "x-user-id");
  const chatId = headerTrimmedCI(req, "x-chat-id");
  if (userId) out["X-User-Id"] = userId;
  if (chatId) out["X-Chat-Id"] = chatId;
  return out;
}
