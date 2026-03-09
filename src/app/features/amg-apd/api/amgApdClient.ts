/**
 * AMG-APD API client: headers and paths for versioning.
 * Backend uses X-User-Id and X-Chat-Id. Callers must pass the actual Firebase user id
 * (e.g. from useAuth().userId); no default user or chat id.
 */

export type AmgApdHeaders = {
  "X-User-Id"?: string;
  "X-Chat-Id"?: string;
};

/**
 * Build headers for AMG-APD requests. Pass actual Firebase userId (and chatId when scoped to a project).
 */
export function getAmgApdHeaders(overrides?: {
  userId?: string;
  chatId?: string;
}): AmgApdHeaders {
  const headers: AmgApdHeaders = {};
  if (overrides?.userId) headers["X-User-Id"] = overrides.userId;
  if (overrides?.chatId) headers["X-Chat-Id"] = overrides.chatId;
  return headers;
}

/**
 * Merge AMG-APD headers into a HeadersInit (for fetch).
 */
export function mergeAmgApdHeaders(
  init: RequestInit = {},
  overrides?: { userId?: string; chatId?: string },
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
