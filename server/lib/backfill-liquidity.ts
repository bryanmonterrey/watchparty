import "server-only";

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
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

/** Matches the read side's window in `server/routers/trending.ts` — a row the
 *  board will not serve is not worth a credit. */
const SCREEN_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Stop starting new calls this long into a pass. The cron's `maxDuration` is
 *  120s and each screen call carries an 8s timeout, so a full 20-coin pass
 *  against a slow provider could otherwise outlive the request. */
const SCREEN_DEADLINE_MS = 45_000;

export interface LiquidityScreenResult {
    /** Rows selected for screening — the credits this pass was willing to spend. */
    picked: number;
    /** Rows that came back with a real dollar figure. */
    measured: number;
    /** Rows the provider answered without a liquidity number, or not at all. */
    unmeasured: number;
    /** Calls that threw (timeout, 429, 5xx). */
    failed: number;
    /** True when the deadline cut the pass short. */
    deadlineHit: boolean;
}

/**
 * Fill `liquidity_usd` on the board, a bounded number of coins per pass.
 *
 * ## Why this exists at all
 *
 * The pairs sync that writes `trending_coins` cannot supply this figure — its
 * `liquidity` field is not dollars (0.00000038 beside $80M of 24h volume,
 * measured 2026-08-12), so the sync writes NULL by design. The real number is
 * only on `/2/token/details`, which is a PER-COIN call.
 *
 * Until now the only callers of that endpoint were demand-driven — a coin page
 * opening, or discovery's screens — so the board filled in only where somebody
 * happened to look, and (until the coalesce in `trending-mobula.ts`) the next
 * hourly pass wiped it again. Net effect: 0 of 308 fresh rows carried a figure.
 *
 * ## Cost, which is why it's bounded and not a sweep
 *
 * 1 credit per coin. The caller runs this on the SAME hourly gate as the board
 * sync, which is what makes it affordable next to the board's own 4,320/month:
 *
 *     20/pass, hourly   =    480/month   -> fits the 10k free tier
 *     20/pass, 5-min    =  5,760/month   -> $50 tier
 *     the whole board   = ~308 credits per full sweep, every pass -> neither
 *
 * At 20/hour a ~300-row board measures itself in about 15 hours, then only has
 * to keep pace with churn.
 *
 * ## Highest volume first, and the stall it can cause
 *
 * Ordering by 24h volume spends the budget where the board is most read, and on
 * the coins most likely to HAVE a figure. The failure mode to watch: a coin with
 * large volume that the provider never returns liquidity for stays NULL, stays
 * at the head of this ordering, and gets re-paid for every pass. That is why the
 * result separates `measured` from `unmeasured` and the cron reports both — a
 * pass that keeps coming back all-unmeasured is the signal to key retries off a
 * screened-at timestamp instead. It is not worth a schema column before that
 * shows up in the numbers.
 *
 * Never throws: a failed screen leaves the status quo (an unmeasured row), which
 * the board already renders correctly.
 */
export async function screenBoardLiquidity(limit: number): Promise<LiquidityScreenResult> {
    const out: LiquidityScreenResult = {
        picked: 0,
        measured: 0,
        unmeasured: 0,
        failed: 0,
        deadlineHit: false,
    };
    if (!Number.isFinite(limit) || limit <= 0) return out;

    let rows: { network: string; tokenAddress: string }[] = [];
    try {
        rows = await db
            .select({ network: trendingCoins.network, tokenAddress: trendingCoins.tokenAddress })
            .from(trendingCoins)
            .where(
                and(
                    isNull(trendingCoins.liquidityUsd),
                    // gte() with the COLUMN, never a Date interpolated into a
                    // sql template — drizzle needs the column to reach its
                    // timestamptz encoder, and the bare Date is what workerd's
                    // Buffer polyfill throws on. See CLAUDE.md.
                    gte(trendingCoins.fetchedAt, new Date(Date.now() - SCREEN_STALE_AFTER_MS)),
                ),
            )
            // Postgres defaults DESC to NULLS FIRST, which would spend the whole
            // budget on rows with no volume at all.
            .orderBy(sql`${trendingCoins.volume24hUsd} desc nulls last`)
            .limit(Math.floor(limit));
    } catch (err) {
        console.warn("[liquidity-screen] select failed:", err instanceof Error ? err.message : err);
        return out;
    }

    out.picked = rows.length;
    const deadline = Date.now() + SCREEN_DEADLINE_MS;

    // Sequential on purpose. Mobula's free key refuses a meaningful share of
    // concurrent requests regardless of spacing, and this pass has no deadline
    // pressure worth trading that for — it is a background fill, not a read path.
    for (const row of rows) {
        if (Date.now() > deadline) {
            out.deadlineHit = true;
            break;
        }
        try {
            const sec = await securityWithLiquidityBackfill(row.network, row.tokenAddress);
            if (sec?.liquidityUsd != null) out.measured++;
            else out.unmeasured++;
        } catch (err) {
            out.failed++;
            console.warn(
                `[liquidity-screen] ${row.network}:${row.tokenAddress} failed:`,
                err instanceof Error ? err.message : err,
            );
        }
    }

    return out;
}
