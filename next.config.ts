import type { NextConfig } from "next";

/** Server-side proxy target; prefer BACKEND_BASE in CI/deploy, fallback for local dev. */
const BACKEND =
  process.env.BACKEND_BASE?.trim() ||
  process.env.NEXT_PUBLIC_BACKEND_BASE?.trim() ||
  "http://localhost:8080";

const nextConfig: NextConfig = {
  // ESLint and TypeScript are enforced via `npm run ci` (lint + typecheck before build).
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
    ];
  },
};
export default nextConfig;
