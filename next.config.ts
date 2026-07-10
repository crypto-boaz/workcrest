import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backend = (
      process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");
    return [
      // Preserve terminal slashes for Django routes. A wildcard rewrite drops
      // the slash from its capture, which otherwise creates an APPEND_SLASH
      // redirect loop at the public Vercel URL.
      {
        source: "/api/:path*/",
        destination: `${backend}/api/:path*/`,
      },
      {
        source: "/api/v1/auth/:path*",
        destination: `${backend}/api/v1/auth/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/media/:path*/",
        destination: `${backend}/media/:path*/`,
      },
      {
        source: "/media/:path*",
        destination: `${backend}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
