/**
 * Dashboard routes for AMG APD (patterns, compare, check, etc.) where the global
 * Topbar should scroll with the page instead of staying sticky.
 */
export function isAmgApdScrollWithContentPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (
    pathname === "/dashboard/patterns" ||
    pathname.startsWith("/dashboard/patterns/")
  ) {
    return true;
  }
  if (/^\/project\/[^/]+\/patterns(?:\/|$)/.test(pathname)) return true;
  if (/^\/project\/[^/]+\/pattern(?:\/|$)/.test(pathname)) return true;
  return false;
}
