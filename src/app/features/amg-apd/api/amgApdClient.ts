/**
 * AMG-APD API client: headers and paths for versioning.
 * Backend uses X-User-Id and X-Chat-Id; if omitted it uses TestUser123 / TestChat123.
 */

const DEFAULT_USER_ID = "TestUser123";
const DEFAULT_CHAT_ID = "TestChat123";

export type AmgApdHeaders = {
  "X-User-Id"?: string;
  "X-Chat-Id"?: string;
};

/**
 * Build headers for AMG-APD requests. Use from app state when available.
 */
export function getAmgApdHeaders(overrides?: {
  userId?: string;
  chatId?: string;
}): AmgApdHeaders {
  return {
    "X-User-Id": overrides?.userId ?? DEFAULT_USER_ID,
    "X-Chat-Id": overrides?.chatId ?? DEFAULT_CHAT_ID,
  };
}

/**
 * Merge AMG-APD headers into a HeadersInit (for fetch).
 */
export function mergeAmgApdHeaders(
  init: RequestInit = {},
  overrides?: { userId?: string; chatId?: string }
): RequestInit {
  const amg = getAmgApdHeaders(overrides);
  const prev = (init.headers ?? {}) as Record<string, string>;
  return {
    ...init,
    headers: {
      ...prev,
      ...amg,
    },
  };
}
