import type { NextRequest } from "next/server";

const DEFAULT_USER_ID = "TestUser123";
const DEFAULT_CHAT_ID = "TestChat123";

/**
 * Build headers to forward to AMG-APD backend from incoming request.
 * Reads X-User-Id and X-Chat-Id from request; uses placeholders if missing.
 */
export function getBackendAmgApdHeaders(req: NextRequest): Record<string, string> {
  return {
    "X-User-Id": req.headers.get("x-user-id") ?? DEFAULT_USER_ID,
    "X-Chat-Id": req.headers.get("x-chat-id") ?? DEFAULT_CHAT_ID,
  };
}
