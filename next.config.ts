import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  // The Supabase CA is read at runtime for verified TLS; make sure every function bundle carries it.
  outputFileTracingIncludes: { "/**": ["./certs/**"] },
  partialPrefetching: true,
  experimental: {
    // Brand assets (decks, logos, photos) and theme files are uploaded through Server Actions; Vercel caps a request at 4.5 MB.
    serverActions: { bodySizeLimit: "4.4mb" },
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
