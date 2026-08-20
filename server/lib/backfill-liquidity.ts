import "server-only";

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
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

/**
 * How long a measured figure is trusted before the screen re-checks it.
 *
 * 6h, matching the board's own staleness window: a row older than that is not
 * served anyway, so refreshing faster would spend credits on rows nobody sees.
 * This is what turns liquidity_usd from a one-shot fill into a maintained
 * measurement — and what lets a wrong value correct itself.
 */
const SCREEN_REFRESH_MS = 6 * 60 * 60 * 1000;

/**
 * The fast lane: a row whose own stats look like a rug in progress gets
 * re-measured after 1h instead of 6.
 *
 * Exists since HAT (2026-08-20): a coin that pumps +249,857% and rugs AFTER
 * its last screen keeps riding a stale healthy figure for up to the full
 * refresh TTL. The rug signature is already sitting in the row — a
 * thousand-fold price move, or millions of "volume" against a double-digit
 * holder count (HAT: 37 holders, $9.6M claimed; SOLUG: 24 and $16.8M).
 * Wall-clock, not credits: the screen's caller is already bounded per pass
 * and this only changes WHEN a row becomes eligible, never how many are read.
 *
 * The holder clause requires a REPORTED count on purpose — `NULL < 200` is
 * not true in SQL, so majors whose holder count the pairs feed omits (SOL
 * itself) don't get dragged into the fast lane by their volume alone.
 */
const SUSPICIOUS_REFRESH_MS = 60 * 60 * 1000;
const suspiciousRow = () => sql`(
    abs(coalesce(${trendingCoins.priceChange1h}, 0)) >= 1000
    OR abs(coalesce(${trendingCoins.priceChange24h}, 0)) >= 5000
    OR (${trendingCoins.volume24hUsd} >= 1000000 AND ${trendingCoins.holdersCount} < 200)
)`;

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
 * ## The source is MOBULA, and the detour through Dexscreener was a mistake
 *
 * The 429 storm that made this look unusable ("Max usage reached" on ~75% of
 * calls at any spacing) was an EXHAUSTED KEY, not a property of the API. On a
 * fresh key, measured 2026-08-13: 15 rapid-fire calls, 15 × HTTP 200, no
 * throttling at all.
 *
 * Dexscreener was swapped in while that key was dead, and its numbers turned
 * out to be wrong here. Cross-checked against GeckoTerminal, which is fully
 * independent of both:
 *
 *     coin      Mobula     GeckoTerminal    Dexscreener (what we wrote)
 *     SNDK      $2.18      $4.06            $256,075
 *     utility   $0.008     $0.03            $237,673
 *     XST       $2.37      $4.76            $114,358
 *
 * Two sources agree these are dust; Dexscreener is the outlier by five orders
 * of magnitude, and it now returns ZERO pairs for the address it valued at
 * $256k. Writing those figures would have kept wash-traded coins on the board
 * while the floor believed they were real markets — the exact failure this
 * screen exists to prevent, inverted.
 *
 * Bounded per pass by wall-clock inside the cron's 120s ceiling, and by credits:
 * 1 per coin.
 *
 * ## It REFRESHES, it does not just fill
 *
 * This selected `WHERE liquidity_usd IS NULL` until 2026-08-14, which made it
 * fill-only: a row that already held a value was invisible to it forever. So a
 * wrong figure was permanent and a stale one was never revisited — and
 * liquidity is a market quantity that moves, not a fixed attribute of a coin.
 * That single predicate is why this problem kept returning in new clothes: each
 * previous fix improved how blanks got FILLED (the producer, the erase on
 * upsert, the provider) and none of them gave the column a way to stay true.
 *
 * Eligibility is now `liquidity_screened_at IS NULL OR older than the TTL`,
 * ordered never-screened first then longest-unrefreshed, and within that by
 * volume so a pass still spends itself where the board is most read.
 *
 * `measured` / `unmeasured` stay separate in the result so a provider that
 * starts returning nothing is visible in the cron's response rather than
 * looking like a quiet success.
 *
 * Never throws: a failed screen leaves the status quo, which the board already
 * renders correctly.
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
                    // NOT `isNull(liquidityUsd)`. That made this fill-only: a row
                    // holding a value was invisible forever, so a WRONG figure
                    // could never be corrected and a STALE one never refreshed —
                    // and liquidity is a market quantity, not a fixed attribute.
                    //
                    // Eligible = never screened, or screened longer ago than the
                    // TTL. Every row written before this column existed reads
                    // NULL, so the Dexscreener-era values are all immediately
                    // eligible and get overwritten IN PLACE. Nothing is nulled,
                    // so no reader ever sees the column go blank.
                    or(
                        isNull(trendingCoins.liquidityScreenedAt),
                        lt(trendingCoins.liquidityScreenedAt, new Date(Date.now() - SCREEN_REFRESH_MS)),
                        // Rug-shaped rows re-qualify on the fast lane — see
                        // suspiciousRow above.
                        and(
                            suspiciousRow(),
                            lt(trendingCoins.liquidityScreenedAt, new Date(Date.now() - SUSPICIOUS_REFRESH_MS)),
                        )!,
                    ),
                    // gte() with the COLUMN, never a Date interpolated into a
                    // sql template — drizzle needs the column to reach its
                    // timestamptz encoder, and the bare Date is what workerd's
                    // Buffer polyfill throws on. See CLAUDE.md.
                    gte(trendingCoins.fetchedAt, new Date(Date.now() - SCREEN_STALE_AFTER_MS)),
                ),
            )
            // Never-screened first (NULLS FIRST is ASC's default here, and is
            // what the index is built for), then longest-unrefreshed, then by
            // volume so a pass still spends itself where the board is most read.
            .orderBy(
                sql`${trendingCoins.liquidityScreenedAt} asc nulls first`,
                sql`${trendingCoins.volume24hUsd} desc nulls last`,
            )
            .limit(Math.floor(limit));
    } catch (err) {
        console.warn("[liquidity-screen] select failed:", err instanceof Error ? err.message : err);
        return out;
    }

    out.picked = rows.length;
    const deadline = Date.now() + SCREEN_DEADLINE_MS;

    // Sequential on purpose — a background fill, not a read path, and there is
    // no deadline pressure worth fanning out for.
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
        // Stamped on EVERY outcome, including failure. Stamping only successes
        // would leave a coin the provider cannot price at the head of the
        // never-screened queue forever, re-picked every pass — the head-of-line
        // stall that made the old fill-only screen measure ~1 coin an hour when
        // the key was refusing calls. One TTL of patience is the right cost for
        // a coin that did not answer.
        await stampScreened(row.network, row.tokenAddress);
    }

    return out;
}

/** Record that this row was looked at, whatever came back. Best-effort: a lost
 *  stamp just means the coin is retried a pass sooner. */
async function stampScreened(network: string, tokenAddress: string): Promise<void> {
    try {
        await db
            .update(trendingCoins)
            .set({ liquidityScreenedAt: new Date() })
            .where(and(eq(trendingCoins.network, network), eq(trendingCoins.tokenAddress, tokenAddress)));
    } catch (err) {
        console.warn("[liquidity-screen] stamp failed:", err instanceof Error ? err.message : err);
    }
}
