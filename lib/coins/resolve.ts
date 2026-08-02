import "server-only";

import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { withCache } from "@/lib/cache";
import { CallBudget, searchPools } from "@/lib/coin-feed/geckoterminal";

/** What /coin/<mint> needs to render a coin we did not launch. Deliberately the
 *  same shape the chart overlay takes, so one view serves both. */
export type ResolvedCoin = {
    id: string;
    network: string;
    tokenAddress: string;
    poolAddress: string;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    txns24h: number | null;
};

// GeckoTerminal's free tier is ~30 calls/MINUTE for the whole app, and two
// per-minute crons already draw on it. A page request therefore gets a budget of
// exactly one call, and the answer is cached hard: a coin page that missed the
// cache on every view could starve the alert feed's own quota within a minute of
// traffic.
const PAGE_BUDGET = 1;
/** Long enough that a coin doing the rounds costs one upstream call, short
 *  enough that a new listing appears within the hour. The view's own live
 *  queries (chart, trades) are what stay fresh — this is identity + a snapshot. */
const TTL_SECONDS = 900;

/**
 * Resolve ANY coin address, on any chain, to something the coin page can show.
 *
 * Three sources, cheapest first:
 *   1. `trending_coins` — the board's own rows, complete market snapshot.
 *   2. `tracked_tokens` — everything the alert feed watches. Thinner (no
 *      volume/txn columns), but it is a coin we already know.
 *   3. GeckoTerminal — anything else in the world. `/search/pools` is the only
 *      lookup that takes a bare address with no chain, which is exactly the
 *      shape of a /coin/<mint> URL.
 *
 * Returns null only when GT has never heard of the address either — at which
 * point the page really is a 404.
 */
export async function resolveCoin(mint: string): Promise<ResolvedCoin | null> {
    const trending = await db.query.trendingCoins.findFirst({
        where: or(eq(trendingCoins.tokenAddress, mint), eq(trendingCoins.id, mint)),
    });
    if (trending) {
        return {
            id: trending.id,
            network: trending.network,
            tokenAddress: trending.tokenAddress,
            poolAddress: trending.poolAddress,
            symbol: trending.symbol,
            name: trending.name,
            imageUrl: trending.imageUrl,
            priceUsd: trending.priceUsd,
            marketCapUsd: trending.marketCapUsd,
            liquidityUsd: trending.liquidityUsd,
            volume24hUsd: trending.volume24hUsd,
            priceChange24h: trending.priceChange24h,
            buys24h: trending.buys24h,
            sells24h: trending.sells24h,
            txns24h: trending.txns24h,
        };
    }

    const tracked = await db.query.trackedTokens.findFirst({
        where: or(eq(trackedTokens.tokenAddress, mint), eq(trackedTokens.id, mint)),
    });
    if (tracked) {
        // The watch list carries the same cached market columns as the board,
        // minus the per-side transaction counts — those are a trending-only
        // sync. They stay null and render as em-dashes rather than being faked.
        return {
            id: tracked.id,
            network: tracked.network,
            tokenAddress: tracked.tokenAddress,
            poolAddress: tracked.poolAddress,
            symbol: tracked.symbol,
            name: tracked.name,
            imageUrl: tracked.imageUrl,
            priceUsd: tracked.priceUsd,
            marketCapUsd: tracked.marketCapUsd,
            liquidityUsd: tracked.liquidityUsd,
            volume24hUsd: tracked.volume24hUsd,
            priceChange24h: tracked.priceChange24h,
            buys24h: null,
            sells24h: null,
            txns24h: null,
        };
    }

    // Cached on the ADDRESS, including misses — an address that isn't a coin is
    // the cheapest thing to get hammered with (a crawler, a bad link), and
    // re-asking GT every time is what would trip the rate limit.
    return withCache(`coin:resolve:v1:${mint}`, TTL_SECONDS, async () => {
        const pools = await searchPools(mint, new CallBudget(PAGE_BUDGET));
        // searchPools matches on symbols and names too, so require the address
        // to be the pool's BASE token — otherwise "SOL" as a query would resolve
        // to whatever pool GT ranked first.
        const pool = pools.find((p) => p.tokenAddress.toLowerCase() === mint.toLowerCase());
        if (!pool) return null;

        return {
            id: `${pool.network}:${pool.tokenAddress}`,
            network: pool.network,
            tokenAddress: pool.tokenAddress,
            poolAddress: pool.poolAddress,
            symbol: pool.symbol,
            name: pool.name,
            imageUrl: pool.imageUrl,
            priceUsd: pool.priceUsd,
            marketCapUsd: pool.marketCapUsd,
            liquidityUsd: pool.liquidityUsd,
            volume24hUsd: pool.volume24hUsd,
            priceChange24h: pool.priceChange24h,
            buys24h: pool.buys24h,
            sells24h: pool.sells24h,
            txns24h:
                pool.buys24h != null || pool.sells24h != null
                    ? (pool.buys24h ?? 0) + (pool.sells24h ?? 0)
                    : null,
        };
    });
}
