import "server-only";

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { fetchMobulaTokenSecurity } from "@/lib/coins/mobula";
import { fetchTokenPairs } from "@/lib/coins/dexscreener";

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
 * ## The source is DEXSCREENER, not Mobula, and that is the whole design
 *
 * This originally called Mobula's `/2/token/details` at 1 credit each. Measured
 * against production on 2026-08-13, that was the wrong choice twice over:
 *
 *   - the free key answered **429 "Max usage reached" to ~75%** of calls at any
 *     spacing, so a 20-coin pass measured about 1 coin;
 *   - and being metered, it had to stay bounded to ~480 credits/month, which
 *     put a full sweep of a ~300-row board weeks away.
 *
 * Dexscreener reports the same figure — real dollars, `liquidity.usd` — for
 * free, at per-IP limits in the HUNDREDS per minute (see lib/coins/dexscreener,
 * which already fronts every coin page for untracked coins). The two coins
 * Mobula refused hardest answered instantly:
 *
 *     SNDK     $80,068,102 of 24h volume   ->  $27.69 liquidity
 *     UNITREE  $60,386,088                 ->   $3.67
 *
 * Which is the point of measuring at all: both were sitting at the TOP of the
 * board, and both are wash trade. `MIN_BOARD_LIQUIDITY_USD` cannot exclude a
 * coin whose liquidity is unknown — NULL means "not yet measured", never "none"
 * — so every unmeasured row is a row the spam floor is blind to.
 *
 * Still bounded per pass, but now by wall-clock rather than money: each coin is
 * one HTTP round trip, and this runs inside a cron with a 120s ceiling.
 *
 * ## Highest volume first
 *
 * Spends the pass where the board is most read, and on the coins whose being
 * wrong matters most. `measured` / `unmeasured` stay separate in the result so a
 * provider that starts returning nothing is visible in the cron's response
 * rather than looking like a quiet success.
 *
 * NOTE: batching (`/tokens/a,b,c`) is deliberately NOT used. That endpoint caps
 * at 30 PAIRS, not 30 tokens, so one deep coin's pools consume the whole
 * response — measured: a 4-address request came back with 30 pairs covering
 * only SOL and WETH, silently dropping the other two.
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
            const pairs = await fetchTokenPairs(row.tokenAddress);
            if (!pairs.length) {
                out.unmeasured++;
                continue;
            }

            // Prefer a pair on the row's OWN chain. An EVM address is not
            // chain-unique — the same bytes can exist on several chains — so the
            // globally deepest pair can describe a different coin entirely.
            // Solana addresses are unambiguous and fall through to the same
            // answer either way.
            //
            // Falls back to the deepest overall when the slugs don't line up:
            // ours came from GeckoTerminal and dexscreener's differ ("eth" vs
            // "ethereum"), and CHAIN_TO_NETWORK only covers the pairs we knew to
            // map. A real figure from the wrong slug beats no figure.
            const onChain = pairs.filter((p) => p.network === row.network);
            const best = (onChain.length ? onChain : pairs)[0];
            const liq = best?.liquidityUsd;

            if (liq == null) {
                out.unmeasured++;
                continue;
            }
            await backfillTrendingLiquidity(row.network, row.tokenAddress, liq);
            out.measured++;
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
