/**
 * Reads the project id from app routes such as `/project/:id/chat` or `/project/:id`.
 */
export function getProjectIdFromPathname(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/project\/([^/]+)(?:\/|$)/);
  return m?.[1] ?? null;
}
