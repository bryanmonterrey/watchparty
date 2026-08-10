import type { NextConfig } from "next";

// The console has no API of its own — every /api/* call is the MAIN app's
// (tRPC, better-auth). In production the zone route
// `console.watchparty.xyz/api/*` sends those requests straight to the main
// worker before this app ever sees them; this rewrite is the fallback (and
// the dev story), proxying same-origin /api calls to the real backend so
// cookies keep flowing without any CORS.
const API_ORIGIN =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://watchparty.xyz";

const nextConfig: NextConfig = {
  // Pin the project root HERE, not the repo root Next would infer from the
  // parent lockfile. The bundler must never resolve modules outside console/
  // (cross-boundary imports are types only — the mobile/ rule); widening the
  // root also breaks OpenNext's standalone layout at the "Bundling cache
  // assets" step.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
