/**
 * Mobula OHLCV adapter — a REMOVABLE trial of a paid market-data provider.
 *
 * See docs/market-data-options.md for why this exists. Short version: every
 * chart read went to GeckoTerminal from Cloudflare's shared egress IP, and GT
 * limits per IP — measured at ~6 calls/min, so production charts were blank on
 * every chain.
 *
 * ── HOW TO REMOVE ────────────────────────────────────────────────────────────
 * Delete `MOBULA_API_KEY` from the environment. That's it. With the variable
 * unset every function here reports disabled, the caller skips this path
 * entirely, and behaviour is byte-for-byte what it was before. No code change,
 * no redeploy needed. Deleting this file plus its one call site in
 * lib/tokens/udf-datafeed removes it permanently.
 *
 * ── HOW TO TRIAL IT ──────────────────────────────────────────────────────────
 *   MOBULA_API_KEY=demo    → demo-api.mobula.io, NO key needed, no billing.
 *   MOBULA_API_KEY=<key>   → api.mobula.io with the key.
 *
 * The demo endpoint is real data (verified against Solana, Base and Ethereum)
 * and is the honest way to evaluate this before paying for anything. Mobula
 * labels it for testing only, so it should not carry production traffic.
 *
 * ── WHY THIS IS BETTER THAN THE GT PATH ──────────────────────────────────────
 * Mobula keys OHLCV by TOKEN ADDRESS, not by pool. The GT path first had to
 * discover a pool, and that lookup was itself the thing failing in production —
 * `resolvePool` returned null and the reader gave up before touching candles we
 * already had. This adapter has no such dependency, so it works for a coin we
 * have never seen on a chain we have never indexed.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * A GET to ohlcv-history costs 5 CREDITS, not 1 (their docs, under Rate Limit).
 * On the $50/mo Start-up plan's 125k credits that is 25,000 chart fetches a
 * month, ~830/day. Fine for fetch-on-open, nowhere near enough to poll. Which
 * is why liveness belongs on Helius push, not here.
 */

import type { Candle } from "@/lib/coins/candle-resolution";

const DEMO_BASE = "https://demo-api.mobula.io/api";
const LIVE_BASE = "https://api.mobula.io/api";

/** Max candles per request, per their docs. */
const MAX_CANDLES = 2000;

const rawKey = () => process.env.MOBULA_API_KEY?.trim() || "";
const isDemo = () => rawKey().toLowerCase() === "demo";

/** The whole feature flag. Unset ⇒ this module does nothing. */
export const mobulaEnabled = () => !!rawKey();

/**
 * Upstream cadence per plan — how often the tRPC caches let a coin cost a
 * fresh Mobula call. The FREE key has 10k credits/month, which a 5s trades
 * window would burn in days (12/min per watched coin); these defaults keep a
 * continuously-watched coin near ~2.9k calls/day worst case, and real usage
 * far below it. Set MOBULA_PLAN=startup after upgrading to the $50 tier
 * (125k credits) and every board tightens without a code change.
 */
export function mobulaCadence() {
    const free = (process.env.MOBULA_PLAN ?? "free").trim().toLowerCase() === "free";
    return free
        ? { tradesTtl: 30, chainFeedTtl: 300, securityTtl: 900 }
        : { tradesTtl: 5, chainFeedTtl: 90, securityTtl: 120 };
}

/**
 * TradingView resolution → Mobula `period`.
 *
 * Returns null for anything without an exact match rather than guessing: a
 * silently-wrong period produces a chart that looks plausible and is lying,
 * which is worse than falling through to the existing GT path.
 */
function mobulaPeriod(resolution: string): string | null {
    switch (resolution) {
        case "1":
            return "1m";
        case "5":
            return "5m";
        case "15":
            return "15m";
        case "60":
            return "1h";
        case "240":
            return "4h";
        case "720":
            return "12h";
        case "1D":
        case "D":
            return "1d";
        default:
            return null;
    }
}

/**
 * Our network slugs → Mobula `chainId`.
 *
 * Mobula accepts chain names ("solana", "base", "ethereum"). Our slugs already
 * match for the chains we list, so this is identity with an explicit allowlist
 * rather than a passthrough — an unknown chain should fall through to GT, not
 * become a malformed request that burns credits to 400.
 */
const CHAIN_IDS: Record<string, string> = {
    solana: "solana",
    ethereum: "ethereum",
    eth: "ethereum",
    base: "base",
    arbitrum: "arbitrum",
    optimism: "optimism",
    polygon: "polygon",
    bsc: "bsc",
    avalanche: "avalanche",
};

export function mobulaChainId(network: string): string | null {
    return CHAIN_IDS[network.toLowerCase()] ?? null;
}

type MobulaCandle = { t: number; o: number; h: number; l: number; c: number; v: number };

// ── Chain-wide pair feed (the /trade DexScreener-style board) ────────────────
//
// GET /api/1/market/blockchain/pairs is pair-level and per-chain: every DEX
// pair on the chain with 5m/1h/24h price+volume windows, trade counts, holder
// counts, liquidity and (for launchpad pairs) bonding state. Default order is
// newest-created first; sortBy=volume_24h gives the trending board. Verified
// against the demo host on solana/ethereum/base/polygon/bsc/hyperevm.

/** /trade's chain ids → the `blockchain` param the pairs endpoint accepts.
 *  Separate from CHAIN_IDS above: bnb is "bsc" here, and chains the pairs
 *  endpoint 500s on (bitcoin, robinhood) are simply absent. */
const PAIR_BLOCKCHAINS: Record<string, string> = {
    solana: "solana",
    ethereum: "ethereum",
    base: "base",
    polygon: "polygon",
    bnb: "bsc",
    hyperevm: "hyperevm",
};

/** Symbols that mean "the boring side of the pair" — the wrapped native or a
 *  stable. The OTHER token is the one a trading feed is about. */
const QUOTE_SYMBOLS = new Set([
    "SOL", "WSOL", "ETH", "WETH", "BNB", "WBNB", "POL", "WPOL", "WMATIC",
    "HYPE", "WHYPE", "USDC", "USDC.E", "USDBC", "USDT", "DAI",
]);

interface MobulaPairToken {
    address?: string;
    symbol?: string;
    name?: string;
    logo?: string | null;
    price?: number;
    marketCap?: number;
    bonded?: boolean | null;
    bondingPercentage?: number | null;
}

interface MobulaPairRaw {
    price?: number;
    price_change_5min?: number;
    price_change_1h?: number;
    price_change_6h?: number;
    price_change_24h?: number;
    created_at?: string;
    holders_count?: number;
    volume_5min?: number;
    volume_1h?: number;
    volume_24h?: number;
    trades_24h?: number;
    liquidity?: number;
    source?: string;
    pair?: { address?: string; token0?: MobulaPairToken; token1?: MobulaPairToken };
}

/** One pair, flattened to the token the feed is about. */
export interface MobulaPair {
    tokenAddress: string;
    symbol: string;
    name: string;
    logo: string | null;
    priceUsd: number;
    marketCap: number;
    liquidity: number;
    volume24h: number;
    volume1h: number;
    volume5m: number;
    change24h: number;
    change1h: number;
    change5m: number;
    change6h: number;
    trades24h: number;
    holders: number;
    createdAtMs: number | null;
    source: string;
    bonded: boolean | null;
    bondingPercentage: number | null;
    pairAddress: string | null;
}

/** The side of the pair worth showing: not the wrapped native / stable. When
 *  neither side is a known quote, token0 — pair convention puts the base first. */
function interestingToken(p: MobulaPairRaw): MobulaPairToken | null {
    const t0 = p.pair?.token0;
    const t1 = p.pair?.token1;
    if (!t0 || !t1) return t0 ?? t1 ?? null;
    const q0 = QUOTE_SYMBOLS.has((t0.symbol ?? "").toUpperCase());
    const q1 = QUOTE_SYMBOLS.has((t1.symbol ?? "").toUpperCase());
    if (q0 && !q1) return t1;
    if (q1 && !q0) return t0;
    return t0;
}

/** The coin page's network slugs (GeckoTerminal vocabulary, what resolveCoin
 *  stores) → the `blockchain` param Mobula's token endpoints accept. */
const COIN_NETWORKS: Record<string, string> = {
    solana: "solana",
    eth: "ethereum",
    ethereum: "ethereum",
    base: "base",
    polygon_pos: "polygon",
    polygon: "polygon",
    bsc: "bsc",
    bnb: "bsc",
    avax: "avalanche",
    avalanche: "avalanche",
    hyperevm: "hyperevm",
    arbitrum: "arbitrum",
    optimism: "optimism",
};

export function mobulaCoinBlockchain(network: string): string | null {
    return COIN_NETWORKS[network.toLowerCase()] ?? null;
}

export interface MobulaTrade {
    account: string;
    isBuy: boolean;
    usdValue: number;
    tokenAmount: number;
    /** Unix seconds. */
    ts: number;
    txHash: string;
}

/**
 * Recent trades for ANY token on any covered chain — what freed the coin
 * page's trades/holders board from its Solana-only pool reader. REST because
 * Mobula's websockets are gated to their Growth plan (verified live 2026-08-06:
 * "WebSocket usage is allowed only on Growth and Enterprise plans"); the tRPC
 * layer caches this per coin so every viewer shares one upstream hit per window.
 */
export async function fetchMobulaTokenTrades(
    network: string,
    address: string,
    limit = 100,
): Promise<MobulaTrade[] | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = mobulaCoinBlockchain(network);
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/trades`);
    url.searchParams.set("address", address);
    url.searchParams.set("blockchain", blockchain);
    url.searchParams.set("limit", String(limit));
    // The swap RECIPIENT is the trader — routers/aggregators sit in the middle
    // of transactionSenderAddress on routed swaps.
    url.searchParams.set("useSwapRecipient", "true");

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula trades ${res.status}`);

    const json = (await res.json()) as {
        data?: {
            type?: string;
            baseTokenAmount?: number;
            baseTokenAmountUSD?: number;
            date?: number;
            swapRecipient?: string;
            transactionSenderAddress?: string;
            transactionHash?: string;
        }[];
    };
    return (json.data ?? [])
        .map((t) => ({
            account: t.swapRecipient || t.transactionSenderAddress || "",
            isBuy: t.type === "buy",
            usdValue: t.baseTokenAmountUSD ?? 0,
            tokenAmount: t.baseTokenAmount ?? 0,
            ts: t.date ? Math.floor(t.date / 1000) : 0,
            txHash: t.transactionHash ?? "",
        }))
        .filter((t) => t.account && t.ts > 0);
}

export interface MobulaTokenSecurity {
    holdersCount: number | null;
    securityScore: number | null;
    top10Pct: number | null;
    devPct: number | null;
    snipersPct: number | null;
    snipersCount: number | null;
    insidersPct: number | null;
    insidersCount: number | null;
    bundlersPct: number | null;
    bundlersCount: number | null;
    liquidityBurnPct: number | null;
    noMintAuthority: boolean | null;
    isFreezable: boolean | null;
    buyTaxPct: number | null;
    sellTaxPct: number | null;
    honeypotFlag: boolean | null;
}

/** Holder-quality + contract-safety stats for one token — the MTT-style
 *  security block. One GET to token/details, heavily cacheable. */
export async function fetchMobulaTokenSecurity(
    network: string,
    address: string,
): Promise<MobulaTokenSecurity | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = mobulaCoinBlockchain(network);
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/details`);
    url.searchParams.set("address", address);
    url.searchParams.set("blockchain", blockchain);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula details ${res.status}`);

    const json = (await res.json()) as { data?: Record<string, unknown> };
    const d = json.data;
    if (!d) return null;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const sec = (d.security ?? {}) as Record<string, unknown>;
    const tax = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
        holdersCount: num(d.holdersCount),
        securityScore: num(d.securityScore),
        top10Pct: num(d.top10HoldingsPercentage),
        devPct: num(d.devHoldingsPercentage),
        snipersPct: num(d.snipersHoldingsPercentage),
        snipersCount: num(d.snipersCount),
        insidersPct: num(d.insidersHoldingsPercentage),
        insidersCount: num(d.insidersCount),
        bundlersPct: num(d.bundlersHoldingsPercentage),
        bundlersCount: num(d.bundlersCount),
        liquidityBurnPct: num(d.liquidityBurnPercentage),
        noMintAuthority: typeof sec.noMintAuthority === "boolean" ? sec.noMintAuthority : null,
        isFreezable: typeof sec.isFreezable === "boolean" ? sec.isFreezable : null,
        buyTaxPct: tax(sec.buyTax),
        sellTaxPct: tax(sec.sellTax),
        honeypotFlag: typeof sec.isBlacklisted === "boolean" ? sec.isBlacklisted : null,
    };
}

/**
 * Chain-wide pairs, for /trade's chain feed.
 *
 * `list` picks the board: "trending" is volume-ranked, "new" is the endpoint's
 * natural newest-first order. Returns null (not []) when the provider is off or
 * the chain unsupported, same convention as the candle fetch above.
 */
export async function fetchMobulaChainPairs(
    chain: string,
    list: "trending" | "new",
    limit = 100,
): Promise<MobulaPair[] | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = PAIR_BLOCKCHAINS[chain.toLowerCase()];
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/1/market/blockchain/pairs`);
    url.searchParams.set("blockchain", blockchain);
    url.searchParams.set("limit", String(limit));
    if (list === "trending") {
        url.searchParams.set("sortBy", "volume_24h");
        url.searchParams.set("sortOrder", "desc");
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula pairs ${res.status}`);

    const json = (await res.json()) as { data?: MobulaPairRaw[] };
    const rows = json.data ?? [];

    const out: MobulaPair[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const token = interestingToken(row);
        if (!token?.address || !token.symbol) continue;
        // One row per token: the same coin trades in many pools, and a feed
        // that lists WIF five times reads as a bug. Keep the first (highest
        // volume on trending, newest on new).
        if (seen.has(token.address)) continue;
        seen.add(token.address);
        out.push({
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name ?? token.symbol,
            logo: token.logo ?? null,
            priceUsd: token.price ?? row.price ?? 0,
            marketCap: token.marketCap ?? 0,
            liquidity: row.liquidity ?? 0,
            volume24h: row.volume_24h ?? 0,
            volume1h: row.volume_1h ?? 0,
            volume5m: row.volume_5min ?? 0,
            change24h: row.price_change_24h ?? 0,
            change1h: row.price_change_1h ?? 0,
            change5m: row.price_change_5min ?? 0,
            change6h: row.price_change_6h ?? 0,
            trades24h: row.trades_24h ?? 0,
            holders: row.holders_count ?? 0,
            createdAtMs: row.created_at ? Date.parse(row.created_at) : null,
            source: row.source ?? "",
            bonded: token.bonded ?? null,
            bondingPercentage: token.bondingPercentage ?? null,
            pairAddress: row.pair?.address ?? null,
        });
    }
    return out;
}

/**
 * Fetch candles for a token, in OUR shape (`ts` in unix SECONDS).
 *
 * Returns null — not an empty array — when this path can't serve the request,
 * so the caller can tell "provider is off / chain unsupported" (fall through to
 * GT) apart from "provider answered, this window is genuinely empty".
 */
export async function fetchMobulaCandles(
    tokenAddress: string,
    network: string,
    resolution: string,
    from: number,
    to: number,
    limit = MAX_CANDLES,
): Promise<Candle[] | null> {
    if (!mobulaEnabled()) return null;

    const period = mobulaPeriod(resolution);
    const chainId = mobulaChainId(network);
    if (!period || !chainId) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/ohlcv-history`);
    url.searchParams.set("address", tokenAddress);
    url.searchParams.set("chainId", chainId);
    url.searchParams.set("period", period);
    // Their from/to are MILLISECONDS; ours are seconds. Mixing these up doesn't
    // error, it just returns an empty window forever.
    url.searchParams.set("from", String(from * 1000));
    url.searchParams.set("to", String(to * 1000));
    url.searchParams.set("amount", String(Math.min(MAX_CANDLES, Math.max(1, limit))));
    url.searchParams.set("usd", "true");

    const headers: Record<string, string> = { Accept: "application/json" };
    // The demo host rejects an Authorization header; only send one when live.
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula ohlcv ${res.status}`);

    const json = (await res.json()) as { data?: MobulaCandle[] };
    const rows = json.data ?? [];

    return rows
        .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.c))
        // ms → s, matching coin_candles and the UDF contract.
        .map((r) => ({ ts: Math.floor(r.t / 1000), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 }))
        .filter((b) => b.ts >= from && b.ts <= to)
        .sort((a, b) => a.ts - b.ts);
}
