// Per-surface pricing for the 402 gate — X-developer-console-style resource
// pricing mapped onto watchparty's actual API surfaces.
//
// PURE MODULE, on purpose: imported by the edge gate (lib/api-gate.ts), the
// landing calculator, and the docs table. No redis, no next/server — anything
// added here ships to the browser.
//
// Prices are micro-USD (1_000_000 = $1 = 1 USDC). The unit is a PROCEDURE, not
// an HTTP request: a tRPC batch URL (/api/trpc/a,b,c) is priced as the sum of
// its procedures, so batching saves connections, not money. Gate rejections
// (402s) are never charged.

const usd = (n: number) => Math.round(n * 1_000_000);

/** Default per-procedure price when nothing more specific matches. */
export function defaultPriceMicro(): number {
    const v = parseFloat(process.env.API_402_PRICE_USD ?? "");
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1_000_000) : usd(0.001);
}

// tRPC router prefixes → price. First match wins; order cheap-to-check, most
// common first. Rationale: coin/market reads are cached hard (60s withCache)
// and cost near nothing to serve; content reads hit Postgres; social-graph
// reads are the heaviest queries; upstream-metered surfaces (RPC = Helius
// credits, og-preview = an outbound fetch per call) carry their real cost.
const TRPC_PREFIX_PRICES: readonly (readonly [string, number])[] = [
    ["trade.", usd(0.001)],
    ["trending.", usd(0.001)],
    ["coinFeed.", usd(0.001)],
    ["feed.", usd(0.005)],
    ["post.", usd(0.005)],
    ["comment.", usd(0.005)],
    ["content.", usd(0.005)],
    ["stream.", usd(0.005)],
    ["community.", usd(0.005)],
    ["spaces.", usd(0.005)],
    ["story.", usd(0.005)],
    ["user.", usd(0.01)],
    ["profile.", usd(0.01)],
    ["friends.", usd(0.01)],
];

/** Price for one request by path — tRPC batches sum per procedure. */
export function priceForPathMicro(pathname: string): number {
    if (pathname === "/api/rpc" || pathname.startsWith("/api/rpc/")) return usd(0.005);
    if (pathname.startsWith("/api/udf") || pathname.startsWith("/api/pyth-udf")) return usd(0.005);
    if (pathname.startsWith("/api/og-preview")) return usd(0.01);

    const m = /^\/api\/trpc\/([^/?]+)/.exec(pathname);
    if (m) {
        let total = 0;
        for (const proc of decodeURIComponent(m[1]).split(",")) {
            const hit = TRPC_PREFIX_PRICES.find(([prefix]) => proc.startsWith(prefix));
            total += hit ? hit[1] : defaultPriceMicro();
        }
        return Math.max(total, 1);
    }
    return defaultPriceMicro();
}

/** The public price sheet — drives the landing calculator and the docs table. */
export const PRICE_SHEET = [
    { key: "coins", name: "Coins & markets: Read", desc: "Prices, trending, runners, and coin feeds. Charged per procedure.", usd: 0.001 },
    { key: "content", name: "Posts & streams: Read", desc: "Feeds, posts, comments, streams, spaces, and communities. Charged per procedure.", usd: 0.005 },
    { key: "social", name: "Profiles & graph: Read", desc: "Profiles, followers, and the social graph. Charged per procedure.", usd: 0.01 },
    { key: "charts", name: "Chart data", desc: "Candles and history in TradingView UDF shape. Charged per request.", usd: 0.005 },
    { key: "rpc", name: "RPC proxy", desc: "Solana RPC without running your own node. Charged per request.", usd: 0.005 },
    { key: "preview", name: "Link previews", desc: "OG metadata for any URL, fetched and parsed. Charged per request.", usd: 0.01 },
    { key: "rest", name: "Everything else", desc: "Any other billed endpoint. Charged per request.", usd: 0.001 },
] as const;

export type PriceSheetRow = (typeof PRICE_SHEET)[number];
