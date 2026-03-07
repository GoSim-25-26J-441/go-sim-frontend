import type { NextRequest } from "next/server";

/**
 * Build headers to forward to AMG-APD backend from incoming request.
 * Only forwards X-User-Id and X-Chat-Id when the client sent them (no defaults).
 */
export function getBackendAmgApdHeaders(
  req: NextRequest,
): Record<string, string> {
  const out: Record<string, string> = {};
  const userId = req.headers.get("x-user-id");
  const chatId = req.headers.get("x-chat-id");
  if (userId) out["X-User-Id"] = userId;
  if (chatId) out["X-Chat-Id"] = chatId;
  return out;
}
