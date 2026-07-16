import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray bun.lock one level up (~/Documents/projects,
  // from an accidental `bun add` there) made Next infer THAT as the root, which
  // widens Turbopack's file-watching scope to every sibling project.
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // @drift-labs/sdk's browser build (keypair loader, anchor NodeWallet)
      // still references `fs` on never-taken paths — stub it for the browser.
      fs: { browser: "./lib/node-browser-stub.js" },
    },
  },
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

// Wire getCloudflareContext() into the `next dev` server only. This must NOT run
// during `next build`: it spins up a wrangler/miniflare proxy of every binding,
// and the Hyperdrive binding then demands a local Postgres connection string,
// crashing the production build. Dev-only avoids that; the deployed Worker sets
// up its own context, so init isn't needed in prod.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
