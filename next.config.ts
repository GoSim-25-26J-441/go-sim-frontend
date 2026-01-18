import type { NextConfig } from "next";
const BACKEND = process.env.BACKEND_BASE ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
    ];
  },
};
export default nextConfig;
