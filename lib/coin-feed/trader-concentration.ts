/**
 * Is a coin's activity many people, or a few wallets passing tokens around?
 *
 * This is the signal DexScreener is reported to use and the one we did not have:
 * volume alone cannot tell a genuine move from a handful of wallets trading with
 * each other, and wash volume is cheap to manufacture precisely because every
 * naive ranking rewards it.
 *
 * ## Counts, not dollars — forced by the data
 *
 * The obvious formulation is volume-weighted: what share of USD volume do the
 * top wallets hold? It is not computable here. Measured on `coin_trades`
 * 2026-08-10, **only 1,039 of 5,394 rows carry `amount_usd`** (19%) — and
 * `price_usd` is missing on the same rows. `trader` and `side` are populated on
 * **100%**.
 *
 * So every metric below counts TRADES. A dollar-weighted version would be
 * strictly better and is not available; writing one anyway would produce a
 * confident number from a 19% sample, which is worse than counting honestly.
 *
 * ## The thresholds are measured, not chosen
 *
 * Across tokens with ≥40 recorded trades, top-5 share of trade count spread
 * cleanly:
 *
 *     74 trades /  18 traders   top5 82.4%   round-trip 16.7%   <- five wallets
 *     47 trades /  17 traders   top5 61.7%   round-trip 41.2%
 *    255 trades / 105 traders   top5 35.3%   round-trip 28.6%
 *   1306 trades / 537 traders   top5 22.9%   round-trip 14.0%   <- healthy
 *
 * The two axes are not redundant: the 82.4% token had an unremarkable
 * round-trip rate, and the 61.7% one was flagged mainly by round-trips. Either
 * alone is enough to be suspicious, so the predicate is an OR.
 *
 * ⚠️ Derived from 45 tokens, which is the coverage `coin_trades` had at the
 * time (the helius-trades webhook feeds it, and it was stopped by the Helius
 * quota). Revisit the constants once coverage is broad.
 */

/** Below this, any ratio is sample-size noise — the same trap as buy pressure. */
export const MIN_TRADES_FOR_VERDICT = 40;
/** Top-5 wallets doing this share of the trades is a cluster, not a market. */
export const TOP5_SHARE_WASHY_PCT = 60;
/** Traders who both bought AND sold. High means round-tripping, not adoption. */
export const ROUND_TRIP_WASHY_PCT = 40;

export interface TraderStats {
    /** Total recorded trades in the window. */
    trades: number;
    /** Distinct wallets. */
    traders: number;
    /** Trades belonging to the five busiest wallets. */
    top5Trades: number;
    /** Wallets that appear on both sides of the book. */
    roundTripTraders: number;
}

export interface Concentration {
    /** Share of trades held by the top five wallets, 0-100. */
    top5SharePct: number;
    /** Share of wallets that both bought and sold, 0-100. */
    roundTripPct: number;
    /** Mean trades per wallet. ~1.5-2.4 is normal; high means repetition. */
    tradesPerTrader: number;
    /** False when there isn't enough activity to say anything. */
    hasVerdict: boolean;
    /** Concentrated enough to distrust the volume. Always false without a verdict. */
    washy: boolean;
}

/**
 * Never throws and never divides by zero — this runs over provider data that is
 * routinely absent, and a coin with no recorded trades must come back
 * "no verdict", not "clean" and not "washy".
 */
export function traderConcentration(stats: TraderStats | null | undefined): Concentration {
    const empty: Concentration = {
        top5SharePct: 0,
        roundTripPct: 0,
        tradesPerTrader: 0,
        hasVerdict: false,
        washy: false,
    };
    if (!stats) return empty;

    const { trades, traders, top5Trades, roundTripTraders } = stats;
    if (!Number.isFinite(trades) || trades <= 0 || !Number.isFinite(traders) || traders <= 0) {
        return empty;
    }

    const top5SharePct = (Math.min(top5Trades, trades) / trades) * 100;
    const roundTripPct = (Math.min(roundTripTraders, traders) / traders) * 100;
    const tradesPerTrader = trades / traders;

    // Fail OPEN below the floor, like every other gate in this feed: a quiet
    // coin is not a suspicious one, and refusing to judge is the honest answer.
    const hasVerdict = trades >= MIN_TRADES_FOR_VERDICT;

    return {
        top5SharePct,
        roundTripPct,
        tradesPerTrader,
        hasVerdict,
        washy:
            hasVerdict &&
            (top5SharePct >= TOP5_SHARE_WASHY_PCT || roundTripPct >= ROUND_TRIP_WASHY_PCT),
    };
}

/**
 * SQL for the four inputs, per token, over a time window.
 *
 * Kept beside the scoring rather than inlined at a call site so the definition
 * of "top 5" and "round trip" lives once. Counts only — see the note above on
 * why `amount_usd` is unusable.
 *
 * @param sinceTs unix seconds; `coin_trades.ts` is a bigint of unix seconds.
 */
export function traderStatsSql(tokenAddress: string, sinceTs: number): string {
    // Caller binds these as parameters; this returns the shape for reference and
    // for the one-off audits in scripts/. Kept as a template so the aggregation
    // can be reviewed without reading it out of a query builder.
    return `
WITH t AS (
  SELECT trader, side FROM coin_trades
  WHERE token_address = '${tokenAddress}' AND ts >= ${sinceTs}
)
SELECT
  (SELECT count(*) FROM t)                        AS trades,
  (SELECT count(DISTINCT trader) FROM t)          AS traders,
  (SELECT coalesce(sum(n), 0) FROM (
      SELECT count(*) AS n FROM t GROUP BY trader ORDER BY count(*) DESC LIMIT 5
   ) top5)                                        AS top5_trades,
  (SELECT count(*) FROM (
      SELECT trader FROM t GROUP BY trader
      HAVING bool_or(side = 'buy') AND bool_or(side = 'sell')
   ) rt)                                          AS round_trip_traders`;
}
