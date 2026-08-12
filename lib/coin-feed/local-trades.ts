/**
 * Cluster trades read from OUR OWN tape instead of GeckoTerminal.
 *
 * ## Why this exists
 *
 * `scanToken` fetched recent swaps per coin from GT — one call per coin per
 * pass. That shape is the reason clusters could not follow the rest of the app
 * onto a metered provider: a 20-calls-per-minute budget is 864,000 credits a
 * month, the $400 tier, and no cadence fixes it because the cost scales with
 * how many coins are watched rather than how often they are polled.
 *
 * But we already HAVE a trade tape. `coin_trades` is written by the Helius
 * trades webhook (`app/api/webhooks/helius-trades`) and, once it runs, by the
 * Mobula socket in `realtime/src/tape.ts`. Both are PUSH: the trades arrive
 * whether or not anything asks. Paying a second provider to re-fetch swaps that
 * are already sitting in our own table is the same waste as the discovery half
 * that now reads `trending_coins`.
 *
 * ## The honest trade-off
 *
 * Coverage becomes exactly the tape's coverage. GT would answer for any pool on
 * any chain; this answers only for coins something is actually streaming — 3
 * mints under the current Helius budget, up to 50 once the Tape DO is running.
 *
 * That is narrower, and it is the same call made for the board: a surface that
 * says nothing about a coin it cannot see beats one that fabricates breadth
 * from a provider failing 23.5% of its requests. Alerts simply do not fire for
 * untracked coins, rather than firing wrongly.
 */

import { db } from "@/db";
import { coinTrades } from "@/db/schema/content/coin-trades";
import { and, eq, gt, gte, desc } from "drizzle-orm";
import type { PoolTrade } from "./geckoterminal";

/** Mirrors GT's page size, so cluster tuning constants keep their meaning. */
const MAX_TRADES = 300;

/**
 * Recent swaps for one pool, newest first — the same shape and ordering
 * `fetchPoolTrades` returns, so `scanToken` needs no other change.
 *
 * @param sinceMs only trades at or after this instant. The caller passes its
 *   watermark; without it a quiet coin re-reads the same 300 rows every pass.
 * @returns [] rather than null. Null means "the request FAILED" to scanToken,
 *   which then leaves its cursors untouched and retries — a local read that
 *   genuinely found nothing must not be reported as an outage, or the queue
 *   stops advancing and every other coin starves behind it.
 */
export async function readPoolTrades(
    network: string,
    poolAddress: string,
    minUsd: number,
    sinceMs?: number,
): Promise<PoolTrade[]> {
    const conds = [eq(coinTrades.network, network), eq(coinTrades.poolAddress, poolAddress)];
    // `ts` is unix SECONDS (bigint); the watermark arrives in milliseconds.
    if (sinceMs) conds.push(gte(coinTrades.ts, Math.floor(sinceMs / 1000)));
    // Dust floor, matching what GT applied server-side — bot wallets trading
    // $2 would otherwise inflate a cluster's trader count.
    if (minUsd > 0) conds.push(gt(coinTrades.amountUsd, minUsd));

    const rows = await db
        .select({
            signature: coinTrades.signature,
            trader: coinTrades.trader,
            side: coinTrades.side,
            amountUsd: coinTrades.amountUsd,
            ts: coinTrades.ts,
        })
        .from(coinTrades)
        .where(and(...conds))
        .orderBy(desc(coinTrades.ts))
        .limit(MAX_TRADES);

    return rows.map((r) => ({
        txHash: r.signature,
        trader: r.trader,
        side: r.side === "sell" ? "sell" : "buy",
        usd: r.amountUsd ?? 0,
        at: new Date(r.ts * 1000),
        // The tape stores no per-trade price. Null rather than derived: every
        // consumer already treats it as optional, and inventing one from
        // amountUsd/amountToken would look exactly like a real quote.
        priceUsd: null,
    }));
}
