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
