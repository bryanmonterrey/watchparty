import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { coinIndex } from "@/db/schema/content/coin-index";

/**
 * Find a token's pool address in OUR database.
 *
 * This exists because pool resolution was the load-bearing dependency nobody
 * noticed. `coin_candles` is keyed by pool_address, so serving a chart from our
 * own table still required knowing the pool — and the only lookup was a
 * GeckoTerminal call. GT rate-limits per IP and every Cloudflare Worker shares
 * an egress pool, so that call fails in production, `resolvePool` returned null,
 * and the reader bailed out with `no_data` BEFORE reaching the candles we'd
 * already stored. Owning the candles bought us nothing while the key to them
 * lived behind the API we were trying to stop depending on.
 *
 * Every one of these tables already carries pool_address, populated by syncs
 * that run on a schedule rather than in the request path. A chart read is now a
 * single indexed lookup against data we own.
 *
 * Returns null when we genuinely haven't seen the token — the caller still has
 * the GT path for that case, which is correct: a coin nobody has ever charted
 * has to be discovered somehow. The difference is that it's now the exception
 * rather than every single request.
 */
export async function lookupPoolAddress(
    mint: string,
    network: string,
): Promise<string | null> {
    // Ordered by freshness, not by cost — all three are indexed lookups on the
    // same connection, and the difference between them is how current the pool
    // is likely to be. trending_coins is rewritten every sync pass.
    const [trending] = await db
        .select({ pool: trendingCoins.poolAddress })
        .from(trendingCoins)
        .where(and(eq(trendingCoins.network, network), eq(trendingCoins.tokenAddress, mint)))
        .limit(1);
    if (trending?.pool) return trending.pool;

    const [tracked] = await db
        .select({ pool: trackedTokens.poolAddress })
        .from(trackedTokens)
        .where(and(eq(trackedTokens.network, network), eq(trackedTokens.tokenAddress, mint)))
        .limit(1);
    if (tracked?.pool) return tracked.pool;

    const [indexed] = await db
        .select({ pool: coinIndex.poolAddress })
        .from(coinIndex)
        .where(and(eq(coinIndex.network, network), eq(coinIndex.tokenAddress, mint)))
        .limit(1);
    if (indexed?.pool) return indexed.pool;

    return null;
}
