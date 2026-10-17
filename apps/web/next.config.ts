import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/apps/web/server.js. The trace starts at the repository
  // root, so it also finds the files of the workspace packages.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  cacheComponents: true,
  partialPrefetching: true,
  // Local runs only (the end-to-end test). On the server, Traefik sends /api to the API app, and
  // DEV_API_ORIGIN is not set.
  async rewrites() {
    const api = process.env.DEV_API_ORIGIN;
    return api ? [{ source: "/api/:path*", destination: `${api}/api/:path*` }] : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
