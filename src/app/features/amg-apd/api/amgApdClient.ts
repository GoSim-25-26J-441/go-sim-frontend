/**
 * AMG-APD API client: headers and paths for versioning.
 * Backend uses X-User-Id and X-Chat-Id. Callers must pass the actual Firebase user id
 * (e.g. from useAuth().userId); no default user or chat id.
 */

/**
 * App Router proxies under /api/amg-apd — server forwards X-User-Id / X-Chat-Id and body to Go.
 * Prefer this over /api/v1/... rewrites: external rewrites can drop PATCH bodies or headers in dev.
 */
export const AMG_APD_VERSIONS_API_BASE = "/api/amg-apd/versions";

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
  const uid = overrides?.userId?.trim();
  const cid = overrides?.chatId?.trim();
  if (uid) headers["X-User-Id"] = uid;
  if (cid) headers["X-Chat-Id"] = cid;
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
