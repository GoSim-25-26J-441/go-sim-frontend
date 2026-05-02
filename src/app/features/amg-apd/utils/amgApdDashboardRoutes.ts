/**
 * Routes where the global Topbar should scroll with the page (not `position: sticky`).
 * Scoped to project patterns home and compare only.
 */
export function isProjectPatternsNonStickyTopbarPath(
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/$/, "") || pathname;
  return /^\/project\/[^/]+\/patterns(?:\/compare)?$/.test(p);
}
