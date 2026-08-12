import "server-only";

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { fetchMobulaTokenSecurity } from "@/lib/coins/mobula";

/**
 * Write a MEASURED liquidity figure onto the board and the watch list.
 *
 * ## Why the board can't fill this itself
 *
 * `trending_coins` is written by the pairs sync, and that endpoint's
 * `liquidity` field is not dollars — measured 2026-08-12, it returned
 * 0.00000038 next to $80,068,102 of 24h volume on the same row. So the sync
 * writes NULL, and the real number has to arrive from `/2/token/details`
 * (`liquidityUSD`), which is a per-coin call the board cannot afford across
 * ~570 rows on a metered plan.
 *
 * What it CAN do is take the number whenever somebody else has already paid for
 * that call. Two callers do:
 *
 *   - `trade.coinSecurity`, every time a coin page is opened;
 *   - discovery's `screenSecurity` / `rescreenTracked`, on their own cadence.
 *
 * So the board fills in over time, weighted by what people actually look at,
 * for zero additional requests.
 *
 * ## It writes both tables on purpose
 *
 * They are different surfaces reading the same fact: `trending_coins` renders
 * the board's liquidity column and feeds its sort, `tracked_tokens` is what
 * `clearsBrandBar` and `evictBrandSquats` consult when deciding whether a
 * brand-squatting coin has earned a place on the alert rail. Filling one and
 * not the other is how the two drift into disagreeing about the same coin.
 *
 * Best-effort by construction: never throws, and the caller does not await it.
 * A missing liquidity figure is the status quo, not a failure.
 */
export async function backfillTrendingLiquidity(
    network: string,
    tokenAddress: string,
    liquidityUsd: number,
): Promise<void> {
    if (!Number.isFinite(liquidityUsd) || liquidityUsd < 0) return;
    try {
        await Promise.all([
            db
                .update(trendingCoins)
                .set({ liquidityUsd })
                .where(and(eq(trendingCoins.network, network), eq(trendingCoins.tokenAddress, tokenAddress))),
            db
                .update(trackedTokens)
                .set({ liquidityUsd })
                .where(and(eq(trackedTokens.network, network), eq(trackedTokens.tokenAddress, tokenAddress))),
        ]);
    } catch (err) {
        console.warn(
            "[backfill-liquidity] write failed:",
            err instanceof Error ? err.message : err,
        );
    }
}

/**
 * Fetch the security block and fill liquidity from it, in one step.
 *
 * Wraps the two together because they are one decision — the only reason the
 * board can afford a real liquidity number is that this call was already being
 * made for the security card, and separating them invites a future caller to
 * make the call and drop the number on the floor again, which is exactly how
 * `liquidityUSD` went unread for months.
 *
 * The write is deferred with `after()` so a board update never delays the card,
 * and falls back to running inline outside a request scope (a cron caller, or
 * `withSwrCache`'s own background refresh, which is already inside one).
 */
export async function securityWithLiquidityBackfill(network: string, address: string) {
    const sec = await fetchMobulaTokenSecurity(network, address);
    if (sec?.liquidityUsd != null) {
        const write = () => backfillTrendingLiquidity(network, address, sec.liquidityUsd!);
        try {
            after(write);
        } catch {
            void write();
        }
    }
    return sec;
}
