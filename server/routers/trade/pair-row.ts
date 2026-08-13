import { isRiskyHoldings } from "@/lib/coin-feed/quality";
import type { MobulaPair } from "@/lib/coins/mobula";

/**
 * Pure row-shaping for the trade boards. Split out of server/routers/trade.ts,
 * which crossed the 1000-line guard — these are mappers with no db, cache or
 * network in them, which makes them the obvious part to lift.
 */

export function timeAgo(date: Date): string {
    const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

// A Mobula pair in the feed's row shape. External rows carry `chain` +
// `external`, which is what routes them to /coin/<chain>/<address> and (off
// Solana) hides the quick-buy — the swap engine only speaks Solana today.
export function pairToTradeToken(chain: string, p: MobulaPair) {
    // Launchpad pairs (pump.fun-style) keep their real bonding ring; a plain
    // DEX pair has no curve, which in this UI's language is "migrated" — the
    // full ring every already-tradeable coin wears. A pumpfun pair at 0% is
    // still ON the curve (seconds old, nothing bought yet) — without the
    // source check those landed in Migrated, the one column they aren't.
    const onCurve = !p.bonded && ((p.bondingPercentage ?? 0) > 0 || p.source === "pumpfun");
    return {
        id: `${chain}:${p.tokenAddress}`,
        name: p.name,
        symbol: p.symbol,
        imageUrl: p.logo ?? "",
        platform: (p.source === "pumpfun" || p.source === "raydium" || p.source === "meteora"
            ? p.source
            : "other") as "pumpfun" | "raydium" | "meteora" | "other",
        timeAgo: p.createdAtMs ? timeAgo(new Date(p.createdAtMs)) : "",
        hasSocials: {},
        priceUsd: p.priceUsd,
        holderCount: p.holders,
        txCount: p.trades24h,
        bondingProgress: onCurve ? Math.round(p.bondingPercentage ?? 0) : 100,
        solAmount: 0,
        marketCap: p.marketCap,
        volume: p.volume24h,
        buyPercent: 0,
        sellPercent: 0,
        changePercent: p.change24h,
        changePercent5m: p.change5m,
        changePercent1h: p.change1h,
        changePercent6h: p.change6h,
        volume5m: p.volume5m,
        volume1h: p.volume1h,
        status: (p.bonded || !onCurve ? "migrated" : "migrating") as "migrated" | "migrating",
        tokenAddress: p.tokenAddress,
        poolAddress: p.pairAddress,
        creatorIsLive: false,
        liveViewerCount: 0,
        creatorUsername: null,
        createdAtMs: p.createdAtMs,
        chain,
        external: true as const,
        // One boolean, computed server-side from the pair's holder-quality
        // stats, drives the boards' "hide risky coins" toggle.
        risky: isRiskyHoldings(p),
    };
}
