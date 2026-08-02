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
    //
    // NOTE: this comment used to sit here with no flag under it, so the cache
    // stayed on (it defaults to true) and dev kept paying for it — "filesystem
    // cache has been deleted because we previously detected an internal error",
    // then 25-70s cache writes and ~28s compactions on every run.
    turbopackFileSystemCacheForDev: false,
    // NOT enabling experimental.useTypeScriptCli — deliberately, and it's tied
    // to staying on TypeScript 6 (see CLAUDE.md). TS 7 REQUIRES that flag,
    // because `next build` type-checks through TypeScript's JavaScript compiler
    // API which the TS 7 native rewrite doesn't expose; without it the build
    // dies after a full compile ("TypeScript 7.0.2 does not provide the
    // compiler API required by Next.js"). We stay on TS 6 instead: tsc emits
    // nothing here (noEmit + SWC transpile), so TS 7 buys a faster local check
    // and an identical bundle — not worth putting an experimental flag in the
    // deploy path and losing every typescript-eslint rule. Revisit together.
  },
  // /discover became /feed. Permanent, and :path* so the whole subtree comes
  // with it — /discover/post/<id> is the canonical share URL for every post
  // ever shared, and those links live in other people's messages and timelines.
  async redirects() {
    return [
      { source: "/discover", destination: "/feed", permanent: true },
      { source: "/discover/:path*", destination: "/feed/:path*", permanent: true },
    ];
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
