/**
 * Backend base URL for **server-only** code (Route Handlers, Server Actions).
 *
 * - Prefer `BACKEND_BASE` (not exposed to the browser).
 * - Fall back to `NEXT_PUBLIC_BACKEND_BASE` so local/dev setups with only the public var still work.
 * - Client-side code should use `env.BACKEND_BASE` from `@/lib/env` (backed by `NEXT_PUBLIC_BACKEND_BASE`).
 */
export function getServerBackendBase(): string {
  const fromServer = process.env.BACKEND_BASE?.trim();
  if (fromServer) return fromServer;
  const fromPublic = process.env.NEXT_PUBLIC_BACKEND_BASE?.trim();
  if (fromPublic) return fromPublic;
  return "http://localhost:8080";
}
