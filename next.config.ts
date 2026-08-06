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
  // `standalone` ONLY for the container build.
  //
  // opennextjs-cloudflare does its own packaging and does not want this set;
  // the container image does, because it runs `node server.js` directly. The
  // env var keeps the two builds from fighting over one field — the Worker
  // deploy is byte-for-byte what it was.
  output: process.env.BUILD_TARGET === "container" ? "standalone" : undefined,
  experimental: {
    // Barrel-file packages, rewritten to per-module imports at build time.
    //
    // `import { UserIcon } from "@hugeicons/core-free-icons"` reads like one
    // icon; without this it is an import of the package's index, and the
    // package is 125 MB (lucide is another 40). Every module that touches one
    // icon can drag the barrel behind it — into the CLIENT bundle and, because
    // client components are still server-rendered, into the WORKER bundle too.
    // That worker is 41 MB and gets parsed by every isolate before it serves
    // anything, which is what leaves so little of the 128 MB memory ceiling
    // that /api/auth/get-session and user.heartbeat were being killed for
    // exceededMemory.
    //
    // Next ships this transform for exactly this shape. Measure the effect on
    // the deploy's "Total Upload / gzip" line, not by eye.
    optimizePackageImports: [
      "@hugeicons/core-free-icons",
      "@hugeicons/react",
      "lucide-react",
    ],
    // NO `viewTransition` flag — 16.3 DELETED it (vercel/next.js#96098) and
    // tsc rejects it outright. It had already gone inert: nothing in the
    // runtime read it. View transitions still work here because React's
    // `<ViewTransition>` (global-search "search-bar") ships in the bundled
    // canary and every <Link> navigation already runs inside startTransition.
    // The flag was reserved for Next auto-assigning transition types, which
    // never landed; a NEW flag will gate that if it ever does.
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
  //
  // /feed/post/<id> then became /status/<id>. This one is NOT optional
  // housekeeping: a coin's on-chain metadata carries external_url pointing at
  // the post that launched it, and that JSON is immutable — every coin already
  // launched links to /feed/post/<id> forever. Push notifications with that path
  // have been delivered to phones too. The redirect IS the compatibility layer.
  //
  // Ordering matters: /discover/post/<id> hits the second rule first and lands
  // on /feed/post/<id>, which the third then forwards to /status/<id>.
  async redirects() {
    return [
      { source: "/discover", destination: "/feed", permanent: true },
      { source: "/discover/:path*", destination: "/feed/:path*", permanent: true },
      { source: "/feed/post/:id", destination: "/status/:id", permanent: true },
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
