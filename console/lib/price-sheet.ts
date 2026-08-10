// VENDORED copy of the public price sheet from the main app's
// lib/api-pricing.ts (the bundler must not import across the app boundary —
// see lib/utils.ts). Guarded against drift by tests/console-price-sheet.test.ts
// in the main repo, which deep-compares the two and gates deploy.

export const PRICE_SHEET = [
  {
    key: "coins",
    name: "Coins & markets: Read",
    desc: "Prices, trending, runners, and coin feeds. Charged per procedure.",
    usd: 0.001,
  },
  {
    key: "content",
    name: "Posts & streams: Read",
    desc: "Feeds, posts, comments, streams, spaces, and communities. Charged per procedure.",
    usd: 0.005,
  },
  {
    key: "social",
    name: "Profiles & graph: Read",
    desc: "Profiles, followers, and the social graph. Charged per procedure.",
    usd: 0.01,
  },
  {
    key: "charts",
    name: "Chart data",
    desc: "Candles and history in TradingView UDF shape. Charged per request.",
    usd: 0.005,
  },
  {
    key: "rpc",
    name: "RPC proxy",
    desc: "Solana RPC without running your own node. Charged per request.",
    usd: 0.005,
  },
  {
    key: "preview",
    name: "Link previews",
    desc: "OG metadata for any URL, fetched and parsed. Charged per request.",
    usd: 0.01,
  },
  {
    key: "rest",
    name: "Everything else",
    desc: "Any other billed endpoint. Charged per request.",
    usd: 0.001,
  },
] as const;
