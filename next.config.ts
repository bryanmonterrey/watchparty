import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // View Transitions — global-search ("search-bar") and app-container
    // ("page-content") set `viewTransitionName`, which only morphs across
    // navigations when Next drives them through the View Transitions API.
    // Ported from sidebar; without this flag those names are inert.
    viewTransition: true,
    // Turbopack's on-disk dev cache kept corrupting — the "Compaction failed:
    // Another write batch or compaction is already active" terminal spam — after
    // a build ran alongside `next dev` (both write .next). Turn the dev
    // filesystem cache OFF: cold compiles are a touch slower, but there's no
    // cache DB to corrupt. Safe to re-enable once Turbopack's persistent cache
    // stabilizes. (Dev-only; does not affect production builds/deploys.)
  },
};

export default nextConfig;
