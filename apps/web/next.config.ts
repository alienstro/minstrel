import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Local runs only (the end-to-end test). On Vercel, vercel.json sends /api to the api service, and
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
