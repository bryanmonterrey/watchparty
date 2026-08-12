/**
 * The trending board, sourced from Mobula instead of GeckoTerminal.
 *
 * ## Why move off GeckoTerminal
 *
 * Two measured reasons, not a preference.
 *
 * **It doesn't work from production.** GT rate-limits per IP, and Cloudflare's
 * egress IP is shared — measured in `docs/market-data-options.md`: 200 in 0.4s
 * from a laptop, outright failure from the Worker, ~6 calls/min keyless. That
 * is why production charts were blank on every chain.
 *
 * **It carries no holder data.** GT returns price, volume, liquidity and trade
 * counts. Nothing about who HOLDS a coin. So the board's only possible spam
 * defence was name matching, and name matching provably cannot do the job:
 * `preOPENAI` ($5.4M, impersonator) and `CBETH` ("Coinbase Wrapped Staked ETH",
 * $4.4M, a real Coinbase product) match the same brand term. Concentration
 * separates them instantly; a name list never will.
 *
 * Mobula's chain-wide pairs feed carries both, in ONE call per chain — the same
 * response `/trade` already reads, where the holder stats ride free.
 *
 * ## Cost, which is the whole reason this is per-chain and not per-pool
 *
 * GT's shape forced constant polling of tiny slices (5 chains/min under a
 * 30/min ceiling) — ~1.08M calls/month across both crons. Metered at 1 credit
 * each that is a $400/month plan. Mobula returns an entire chain per call:
 *
 *     6 chains, hourly       = 4,320/month   -> fits the 10k FREE tier
 *     6 chains, every 5 min  = 51,840/month  -> fits the $50 tier
 *
 * The cadence is the dial, and it is set by the caller.
 */

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, eq, sql } from "drizzle-orm";
import { fetchMobulaChainPairs, mobulaEnabled } from "@/lib/coins/mobula";
import { isBoardExcluded, trackedTokenId } from "./networks";
import type { DiscoveredPool } from "./geckoterminal";

/**
 * The chains Mobula's pairs endpoint serves, and the ones the board is scoped
 * to. Verified against the demo host; chains it 500s on (bitcoin, robinhood)
 * are absent from `PAIR_BLOCKCHAINS` and therefore from here.
 */
export const MOBULA_TRENDING_CHAINS = [
    "solana",
    "ethereum",
    "base",
    "polygon",
    "bnb",
    "hyperevm",
] as const;

/**
 * Discovery candidates for the ALERT feed, from Mobula.
 *
 * Two halves, and only one of them costs anything.
 *
 * The "trending" half is READ FROM `trending_coins`, which the board sync
 * already populated this hour — the same coins, already paid for. Calling the
 * API again for rows sitting in our own table is how a metered provider turns
 * into a $400 plan; GeckoTerminal's shape encouraged exactly that, because its
 * calls were free and rate-limited rather than billed.
 *
 * The "new" half genuinely has to be fetched: newly-created pairs are the whole
 * point of discovery and by definition are not on a volume-ranked board yet.
 * One call per chain.
 *
 * ## Cost
 *
 *     2 chains x 1 call ("new" only)
 *     every 30 min -> 2,880/month   + the board's 4,320 = 7,200  (free tier)
 *     every  5 min -> 17,280/month  + 4,320 = 21,600             (over)
 *
 * The old GeckoTerminal cadence was every 5 minutes at 2 calls per network,
 * which is 34,560/month metered. Porting that cadence onto a billed API without
 * checking is the mistake this comment exists to prevent.
 */
export async function discoverFromMobula(
    chains: readonly string[],
    perChainLimit = 100,
): Promise<DiscoveredPool[]> {
    if (!mobulaEnabled()) return [];

    const out: DiscoveredPool[] = [];
    for (const chain of chains) {
        // Paid-for rows first — no call.
        const cached = await db
            .select()
            .from(trendingCoins)
            .where(and(eq(trendingCoins.network, chain), eq(trendingCoins.source, "mobula")))
            .limit(perChainLimit);
        for (const r of cached) {
            if (!r.tokenAddress || !r.symbol) continue;
            out.push({
                network: chain,
                poolAddress: r.poolAddress,
                tokenAddress: r.tokenAddress,
                dexId: r.dexId,
                symbol: r.symbol,
                name: r.name,
                imageUrl: r.imageUrl,
                priceUsd: r.priceUsd,
                marketCapUsd: r.marketCapUsd,
                fdvUsd: r.fdvUsd,
                liquidityUsd: r.liquidityUsd,
                volume5mUsd: r.volume5mUsd,
                volume1hUsd: r.volume1hUsd,
                volume6hUsd: r.volume6hUsd,
                volume24hUsd: r.volume24hUsd,
                priceChange5m: r.priceChange5m,
                priceChange1h: r.priceChange1h,
                priceChange6h: r.priceChange6h,
                priceChange24h: r.priceChange24h,
                buys24h: r.buys24h,
                sells24h: r.sells24h,
                poolCreatedAt: r.poolCreatedAt,
            });
        }

        // The one call that is actually needed.
        const fresh = await fetchMobulaChainPairs(chain, "new", perChainLimit);
        for (const p of fresh ?? []) {
            if (!p.tokenAddress || !p.symbol) continue;
            out.push({
                network: chain,
                poolAddress: p.pairAddress ?? p.tokenAddress,
                tokenAddress: p.tokenAddress,
                dexId: p.source ?? null,
                symbol: p.symbol,
                name: p.name,
                imageUrl: p.logo,
                priceUsd: p.priceUsd,
                marketCapUsd: p.marketCap,
                fdvUsd: null,
                liquidityUsd: p.liquidity,
                volume5mUsd: p.volume5m,
                volume1hUsd: p.volume1h,
                volume6hUsd: null,
                volume24hUsd: p.volume24h,
                priceChange5m: p.change5m,
                priceChange1h: p.change1h,
                priceChange6h: p.change6h,
                priceChange24h: p.change24h,
                // Mobula reports a trade COUNT, not a buy/sell split — see the
                // note in the board sync. A fabricated 50/50 would be
                // indistinguishable from a real buy-pressure signal.
                buys24h: null,
                sells24h: null,
                poolCreatedAt: p.createdAtMs ? new Date(p.createdAtMs) : null,
            });
        }
    }
    return out;
}

export interface MobulaTrendingResult {
    chain: string;
    fetched: number;
    written: number;
    skipped: number;
}

/**
 * Refresh one chain's slice of the board.
 *
 * Returns `null` when Mobula is disabled or the chain is unsupported, so the
 * caller can fall back to GeckoTerminal rather than silently blanking a chain
 * — the same convention the rest of `lib/coins/mobula.ts` uses.
 */
export async function syncTrendingChainFromMobula(
    chain: string,
    limit = 100,
): Promise<MobulaTrendingResult | null> {
    if (!mobulaEnabled()) return null;

    const pairs = await fetchMobulaChainPairs(chain, "trending", limit);
    if (!pairs) return null;

    // One row per TOKEN, deepest pool wins. A coin appears under several pairs
    // in one response, and two rows sharing a primary key inside ONE insert is
    // a hard error rather than something ON CONFLICT resolves.
    const byToken = new Map<string, (typeof pairs)[number]>();
    let skipped = 0;
    for (const p of pairs) {
        if (!p.tokenAddress || !p.symbol) {
            skipped++;
            continue;
        }
        // Stablecoins only — the board wants blue chips, unlike the alert feed.
        if (isBoardExcluded(p.symbol)) {
            skipped++;
            continue;
        }
        const id = trackedTokenId(chain, p.tokenAddress);
        const seen = byToken.get(id);
        if (!seen || (p.liquidity ?? 0) > (seen.liquidity ?? 0)) byToken.set(id, p);
    }

    const rows = [...byToken.values()];
    if (!rows.length) return { chain, fetched: pairs.length, written: 0, skipped };

    const now = new Date();
    await db
        .insert(trendingCoins)
        .values(
            rows.map((p, i) => ({
                id: trackedTokenId(chain, p.tokenAddress),
                network: chain,
                tokenAddress: p.tokenAddress,
                // NOT NULL in the schema, and Mobula omits it for some pairs —
                // fall back to the token so the insert cannot fail on a coin
                // whose pair address simply wasn't reported.
                poolAddress: p.pairAddress ?? p.tokenAddress,
                dexId: p.source ?? null,
                symbol: p.symbol,
                name: p.name,
                imageUrl: p.logo,
                priceUsd: p.priceUsd,
                marketCapUsd: p.marketCap,
                fdvUsd: null,
                liquidityUsd: p.liquidity,
                volume5mUsd: p.volume5m,
                volume1hUsd: p.volume1h,
                volume6hUsd: null,
                volume24hUsd: p.volume24h,
                priceChange5m: p.change5m,
                priceChange1h: p.change1h,
                priceChange6h: p.change6h,
                priceChange24h: p.change24h,
                // Mobula reports a trade COUNT, not a buy/sell split. Leaving
                // buys/sells null rather than inventing a 50/50 split — the
                // memescope buy-pressure filter reads them, and a fabricated
                // ratio would look exactly like a real signal.
                buys24h: null,
                sells24h: null,
                txns24h: p.trades24h ?? null,
                poolCreatedAt: p.createdAtMs ? new Date(p.createdAtMs) : null,
                // The feed is requested volume-ranked, so position IS the rank.
                rank: i + 1,
                top10Pct: p.top10Pct,
                devPct: p.devPct,
                snipersPct: p.snipersPct,
                insidersPct: p.insidersPct,
                bundlersPct: p.bundlersPct,
                holdersCount: p.holders ?? null,
                source: "mobula",
                fetchedAt: now,
            })),
        )
        .onConflictDoUpdate({
            target: trendingCoins.id,
            set: {
                poolAddress: sql`excluded.pool_address`,
                dexId: sql`excluded.dex_id`,
                symbol: sql`excluded.symbol`,
                name: sql`excluded.name`,
                // Keep an image we already have if this pass reports none —
                // same reason discovery coalesces it: a momentary null must not
                // blank a logo that was working.
                imageUrl: sql`coalesce(excluded.image_url, ${trendingCoins.imageUrl})`,
                priceUsd: sql`excluded.price_usd`,
                marketCapUsd: sql`excluded.market_cap_usd`,
                liquidityUsd: sql`excluded.liquidity_usd`,
                volume5mUsd: sql`excluded.volume_5m_usd`,
                volume1hUsd: sql`excluded.volume_1h_usd`,
                volume24hUsd: sql`excluded.volume_24h_usd`,
                priceChange5m: sql`excluded.price_change_5m`,
                priceChange1h: sql`excluded.price_change_1h`,
                priceChange6h: sql`excluded.price_change_6h`,
                priceChange24h: sql`excluded.price_change_24h`,
                txns24h: sql`excluded.txns_24h`,
                poolCreatedAt: sql`coalesce(excluded.pool_created_at, ${trendingCoins.poolCreatedAt})`,
                rank: sql`excluded.rank`,
                // Holder stats coalesce too. Mobula omits them for young pairs,
                // and "we saw 82% top-10 an hour ago" is worth more than a
                // fresh null — which `isRiskyHoldings` reads as no-data and
                // therefore as SAFE. Overwriting a real number with null would
                // silently un-flag a rug.
                top10Pct: sql`coalesce(excluded.top10_pct, ${trendingCoins.top10Pct})`,
                devPct: sql`coalesce(excluded.dev_pct, ${trendingCoins.devPct})`,
                snipersPct: sql`coalesce(excluded.snipers_pct, ${trendingCoins.snipersPct})`,
                insidersPct: sql`coalesce(excluded.insiders_pct, ${trendingCoins.insidersPct})`,
                bundlersPct: sql`coalesce(excluded.bundlers_pct, ${trendingCoins.bundlersPct})`,
                holdersCount: sql`coalesce(excluded.holders_count, ${trendingCoins.holdersCount})`,
                source: sql`excluded.source`,
                fetchedAt: sql`excluded.fetched_at`,
            },
        });

    return { chain, fetched: pairs.length, written: rows.length, skipped };
}
