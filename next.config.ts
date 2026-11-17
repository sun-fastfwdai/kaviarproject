import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  // The Supabase CA is read at runtime for verified TLS; make sure every function bundle carries it.
  outputFileTracingIncludes: {
    // ffmpeg makes thumbnails and compact JPEGs wherever a file is saved; the fonts draw ad cards.
    "/**": ["./certs/**", "./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    // The Final cut runs ffmpeg in the Shoots server function and burns captions with these fonts.
    "/brands/[slug]/creative/shoots": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    // Audience test shrinks ad pictures and pulls frames from videos with the same ffmpeg.
    "/brands/[slug]/audience": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Ad cards: Remy's designed static ads are drawn on the server with these fonts; ffmpeg reads the photo's colours.
    "/brands/[slug]/creative/[batch]": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    "/brands/[slug]/creative": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    "/brands/[slug]/signals/[key]": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    "/brands/[slug]/creative/editor": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    "/brands/[slug]/research": ["./node_modules/ffmpeg-static/ffmpeg", "./src/lib/creative/fonts/**"],
    // Large pictures are sent as JPEGs and thumbnails are made on the fly.
    "/api/assets/[id]": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  // A native binary: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["ffmpeg-static"],
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
