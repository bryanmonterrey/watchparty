import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack's on-disk dev cache kept corrupting — the "Compaction failed:
    // Another write batch or compaction is already active" terminal spam — after
    // a build ran alongside `next dev` (both write .next). Turn the dev
    // filesystem cache OFF: cold compiles are a touch slower, but there's no
    // cache DB to corrupt. Safe to re-enable once Turbopack's persistent cache
    // stabilizes. (Dev-only; does not affect production builds/deploys.)
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
