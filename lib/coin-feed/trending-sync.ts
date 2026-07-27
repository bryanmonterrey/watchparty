// Trending board sync — refreshes `trending_coins` from GeckoTerminal's
// per-chain trending pools.
//
// The whole design point is BUDGET INTERLEAVING. GeckoTerminal's free tier is
// 30 calls/min for the entire app, and the alert scan already spends most of it
// every minute. Sweeping 20 chains in one go would spike ~20 extra calls into a
// single minute and 429 both features at once.
//
// So the sweep is a rotating slice: a few chains per minute, cycling through
// the whole list every ceil(networks / slice) minutes. The slice is picked from
// the wall clock rather than stored state, so it needs no cursor table and
// self-heals if a pass is missed.

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { CallBudget, fetchTrendingPools, type DiscoveredPool } from "./geckoterminal";
import { isExcludedCoin, TRENDING_NETWORKS, trackedTokenId } from "./networks";

/** Chains refreshed per pass. 4 × 1 call = 4 calls/min, so the full 20-chain
 *  list turns over every 5 minutes and the alert scan keeps its share. */
export const NETWORKS_PER_PASS = 4;

/** Don't board coins with no real market behind them, on any chain. Lower than
 *  the alert feed's per-chain floors: this is a browse surface, so the bar is
 *  "is this a real market" rather than "is this worth spending a scan on". */
const MIN_LIQUIDITY_USD = 5_000;
const MIN_VOLUME_24H_USD = 10_000;

/** Rows untouched for this long are dropped — a coin that fell out of every
 *  chain's trending list should leave the board rather than sit there stale. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Which chains this minute handles. Derived from the clock so there's no
 *  cursor to persist and a skipped pass just means that slice waits one cycle. */
export function networksForPass(now = new Date()): { id: string; label: string }[] {
    const slices = Math.ceil(TRENDING_NETWORKS.length / NETWORKS_PER_PASS);
    const slice = Math.floor(now.getTime() / 60_000) % slices;
    return TRENDING_NETWORKS.slice(slice * NETWORKS_PER_PASS, (slice + 1) * NETWORKS_PER_PASS);
}

function boardworthy(pool: DiscoveredPool): boolean {
    // Same exclusion as the alert feed: stables and wrapped majors are not
    // "trending", they're plumbing, and they'd sit at the top of every sort.
    if (isExcludedCoin(pool.symbol, pool.marketCapUsd)) return false;
    return (pool.liquidityUsd ?? 0) >= MIN_LIQUIDITY_USD && (pool.volume24hUsd ?? 0) >= MIN_VOLUME_24H_USD;
}

async function upsert(pools: DiscoveredPool[], ranks: Map<string, number>): Promise<number> {
    if (pools.length === 0) return 0;

    // One row per TOKEN, deepest pool wins — same collision the alert watch
    // list hit: a coin can appear under several pools in one response, and two
    // rows with the same primary key in one INSERT is a hard error, not an
    // ON CONFLICT.
    const byToken = new Map<string, DiscoveredPool>();
    for (const p of pools) {
        const id = trackedTokenId(p.network, p.tokenAddress);
        const seen = byToken.get(id);
        if (!seen || (p.liquidityUsd ?? 0) > (seen.liquidityUsd ?? 0)) byToken.set(id, p);
    }
    const rows = [...byToken.values()];

    await db
        .insert(trendingCoins)
        .values(
            rows.map((p) => ({
                id: trackedTokenId(p.network, p.tokenAddress),
                network: p.network,
                tokenAddress: p.tokenAddress,
                poolAddress: p.poolAddress,
                dexId: p.dexId,
                symbol: p.symbol,
                name: p.name,
                imageUrl: p.imageUrl,
                priceUsd: p.priceUsd,
                marketCapUsd: p.marketCapUsd,
                fdvUsd: p.fdvUsd,
                liquidityUsd: p.liquidityUsd,
                volume5mUsd: p.volume5mUsd,
                volume1hUsd: p.volume1hUsd,
                volume6hUsd: p.volume6hUsd,
                volume24hUsd: p.volume24hUsd,
                priceChange5m: p.priceChange5m,
                priceChange1h: p.priceChange1h,
                priceChange6h: p.priceChange6h,
                priceChange24h: p.priceChange24h,
                buys24h: p.buys24h,
                sells24h: p.sells24h,
                txns24h: (p.buys24h ?? 0) + (p.sells24h ?? 0),
                poolCreatedAt: p.poolCreatedAt,
                rank: ranks.get(`${p.network}:${p.poolAddress}`) ?? null,
                fetchedAt: new Date(),
            })),
        )
        .onConflictDoUpdate({
            target: trendingCoins.id,
            set: {
                poolAddress: sql`excluded.pool_address`,
                dexId: sql`excluded.dex_id`,
                symbol: sql`excluded.symbol`,
                name: sql`excluded.name`,
                imageUrl: sql`coalesce(excluded.image_url, ${trendingCoins.imageUrl})`,
                priceUsd: sql`excluded.price_usd`,
                marketCapUsd: sql`excluded.market_cap_usd`,
                fdvUsd: sql`excluded.fdv_usd`,
                liquidityUsd: sql`excluded.liquidity_usd`,
                volume5mUsd: sql`excluded.volume_5m_usd`,
                volume1hUsd: sql`excluded.volume_1h_usd`,
                volume6hUsd: sql`excluded.volume_6h_usd`,
                volume24hUsd: sql`excluded.volume_24h_usd`,
                priceChange5m: sql`excluded.price_change_5m`,
                priceChange1h: sql`excluded.price_change_1h`,
                priceChange6h: sql`excluded.price_change_6h`,
                priceChange24h: sql`excluded.price_change_24h`,
                buys24h: sql`excluded.buys_24h`,
                sells24h: sql`excluded.sells_24h`,
                txns24h: sql`excluded.txns_24h`,
                poolCreatedAt: sql`coalesce(excluded.pool_created_at, ${trendingCoins.poolCreatedAt})`,
                rank: sql`excluded.rank`,
                fetchedAt: sql`excluded.fetched_at`,
            },
        });

    return rows.length;
}

/** Drop coins that have fallen off trending everywhere. Scoped to the chains
 *  this pass actually refreshed — a global sweep would delete chains whose turn
 *  simply hasn't come round yet. */
async function pruneStale(networkIds: string[]): Promise<number> {
    if (networkIds.length === 0) return 0;
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const removed = await db
        .delete(trendingCoins)
        // inArray, not a raw `in ${array}` — drizzle binds a JS array as ONE
        // parameter, which Postgres rejects for IN.
        .where(and(inArray(trendingCoins.network, networkIds), lt(trendingCoins.fetchedAt, cutoff)))
        .returning({ id: trendingCoins.id });
    return removed.length;
}

export type TrendingSyncResult = {
    networks: string[];
    upserted: number;
    pruned: number;
    rateLimited: boolean;
};

/** One trending pass over this minute's slice of chains. */
export async function runTrendingSync(
    budget: CallBudget,
    networks = networksForPass(),
): Promise<TrendingSyncResult> {
    const found: DiscoveredPool[] = [];
    const ranks = new Map<string, number>();
    const done: string[] = [];

    for (const net of networks) {
        if (budget.remaining <= 0 || budget.rateLimited) break;
        const pools = await fetchTrendingPools(net.id, budget);
        done.push(net.id);
        // GT returns its trending list in order; keep the position before we
        // filter, so rank reflects the chain's real ranking.
        pools.forEach((p, i) => ranks.set(`${p.network}:${p.poolAddress}`, i + 1));
        found.push(...pools.filter(boardworthy));
    }

    let upserted = 0;
    try {
        upserted = await upsert(found, ranks);
    } catch (err) {
        console.error("[trending] upsert failed:", err);
    }

    let pruned = 0;
    try {
        // Only prune chains we actually got data back for; pruning a chain
        // whose request failed would empty it on the strength of an outage.
        pruned = await pruneStale(done.filter((id) => found.some((p) => p.network === id)));
    } catch (err) {
        console.error("[trending] prune failed:", err);
    }

    return { networks: done, upserted, pruned, rateLimited: budget.rateLimited };
}

/** Remove a chain's rows entirely — used when a slug is retired from the list. */
export async function dropNetwork(networkId: string): Promise<void> {
    await db.delete(trendingCoins).where(eq(trendingCoins.network, networkId));
}
