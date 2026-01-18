import type { NextConfig } from "next";
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_BASE ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
    ];
  },
};
export default nextConfig;

module.exports = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};