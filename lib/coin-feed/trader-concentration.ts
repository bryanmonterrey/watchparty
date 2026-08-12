/**
 * Is a coin's activity many people, or a few wallets passing tokens around?
 *
 * This is the signal DexScreener is reported to use and the one we did not have:
 * volume alone cannot tell a genuine move from a handful of wallets trading with
 * each other, and wash volume is cheap to manufacture precisely because every
 * naive ranking rewards it.
 *
 * ## Counts, not dollars — and NOT for the reason first assumed
 *
 * The obvious formulation is volume-weighted: what share of USD volume do the
 * top wallets hold? Until 2026-08-10 it simply wasn't computable — only 19% of
 * `coin_trades` carried `amount_usd`, because Jupiter's `price/v2` was 404ing.
 * That is fixed (`price/v3`): **85.6% of the last 24h is priced**, so the
 * dollar-weighted version became available and was expected to replace this.
 *
 * It should not. Measured across the 42 tokens with ≥40 trades in 7 days, top-5
 * share by VOLUME runs a **median +35.3 points above** the same token's share
 * by COUNT, and it is compressed against the ceiling:
 *
 *     trades  traders   count%   volume%
 *        101       69     18.8      66.2     <- healthy by count
 *         87       59     24.1     100.0     <- healthy by count, 100% by volume
 *         92       41     38.0      81.4
 *        108        9     96.3      99.8     <- genuinely concentrated
 *
 * Count share spreads 18-100% and separates the concentrated tokens from the
 * broad ones. Volume share sits at 60-100% for nearly everything, because a
 * handful of wallets move most of the dollars in ANY market — that is ordinary
 * structure, not wash trading. Swapping the metric while keeping the 60%
 * threshold would have marked almost every coin washy.
 *
 * So `top5VolumeSharePct` is computed and REPORTED, because it is worth
 * showing, and `washy` still rides on counts. Making volume a verdict needs a
 * threshold calibrated against labelled wash trading, which we do not have.
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

/**
 * How many rows `trade.coinTraderConcentration` asks Mobula for. NOT how many
 * get scored — `fetchMobulaTokenTrades` filters to real swaps first, and on EVM
 * chains that removes most of the page.
 *
 * It lives HERE, beside the threshold, because the two are one calibration:
 * the sample size changes the score, so moving either alone silently re-labels
 * coins.
 *
 * ## 1,000, because a smaller page has no SWAPS in it
 *
 * Measured 2026-08-12 through `fetchMobulaTokenTrades` (i.e. post-filter):
 *
 *            requested 200            requested 1000
 *   BONK    200 swaps, top5 27.5%    1000 swaps, top5 33.0%   (103 -> 277 traders)
 *   USDC    197 swaps, top5 50.8%     988 swaps, top5 51.2%   (57 -> 189)
 *   BRETT     7 swaps, top5 85.7%      96 swaps, top5 34.4%   (6 -> 50)
 *
 * BRETT is the case that decides it. Liquidity operations are ~90% of its rows,
 * so a 200-row request yields SEVEN real swaps — under MIN_TRADES_FOR_VERDICT,
 * meaning the card renders nothing at all on a coin with plenty of trading to
 * describe. At 1,000 it clears the floor and scores 34.4%, which is the truth
 * about it.
 *
 * ## And the direction is not predictable
 *
 * The three coins move three ways between the two sample sizes — BONK up 5.5
 * points, USDC flat, BRETT down 51. "More samples dilute the top five" is wrong:
 * a wider window can just as easily be one a few bots dominate. So this is
 * measured, not reasoned about — `scripts/coins/calibrate-concentration.ts`.
 *
 * 1,000 is Mobula's page maximum and it is ONE request either way; the cost is
 * a larger response, not a second call. The limit that bites is 1 REQUEST PER
 * SECOND on the free plan, which is why the caller is cached for 15 minutes.
 *
 * ⚠️ Changing this invalidates TOP5_SHARE_WASHY_PCT. Re-run the script and move
 * both together.
 */
export const CONCENTRATION_SAMPLE = 1000;

/**
 * How long a coin-page read stays SERVEABLE past its fresh window.
 *
 * Long, on purpose, and the reason is measured rather than assumed: Mobula's
 * free plan refuses about half of all `/2/token/trades` requests with a 429,
 * even at 10-second spacing and with the monthly quota untouched (verified
 * 2026-08-12). Under a plain cache each refusal is an empty table; under SWR it
 * is a table a few minutes old, because the background refresh only overwrites
 * on success.
 *
 * The judgement in both numbers is the same one the chart already makes: a
 * slightly old answer beats a blank one on a page about money. `TRADES` is
 * shorter because a stale trade list reads as "nothing is happening", which is
 * itself information and shouldn't be wrong for long.
 */
export const TRADES_STALE_SECONDS = 10 * 60;

/** Holder stats and wash-trading verdicts move over hours, not minutes. */
export const SLOW_STALE_SECONDS = 6 * 60 * 60;
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
    /** Total USD across trades that carry `amount_usd`. Optional — see below. */
    volumeUsd?: number;
    /** USD belonging to the five LARGEST wallets by volume (not the busiest). */
    top5VolumeUsd?: number;
}

export interface Concentration {
    /** Share of trades held by the top five wallets, 0-100. */
    top5SharePct: number;
    /**
     * Share of USD volume held by the five largest wallets, 0-100, or `null`
     * when no priced volume was supplied.
     *
     * ⚠️ REPORTED, NOT JUDGED. This does not drive `washy` — see the note on
     * `TOP5_VOLUME_*` below for the measurement that decided that.
     */
    top5VolumeSharePct: number | null;
    /** Share of wallets that both bought and sold, 0-100. */
    roundTripPct: number;
    /** Mean trades per wallet. ~1.5-2.4 is normal; high means repetition. */
    tradesPerTrader: number;
    /** False when there isn't enough activity to say anything. */
    hasVerdict: boolean;
    /** Concentrated enough to distrust the volume. Always false without a verdict. */
    washy: boolean;
}

/** One swap, in the only shape this module needs. */
export interface ScorableTrade {
    /** The wallet that received the swap. */
    account: string;
    isBuy: boolean;
    /** USD notional. Sign is ignored; 0 or NaN contributes nothing. */
    usdValue?: number;
}

/**
 * Roll a list of swaps into the aggregate the scorer takes.
 *
 * Lives here rather than in the tRPC procedure that calls it because it is the
 * other half of `traderConcentration` — the two must agree on what "top 5"
 * counts (trades, not dollars) and on which wallet a swap belongs to, and they
 * drifted apart the moment one lived in SQL and the other in TypeScript. Being
 * a pure function it is also directly testable, which the SQL never was.
 *
 * Note the two different top-5 sets: `top5Trades` is the five BUSIEST wallets
 * and `top5VolumeUsd` the five LARGEST. They are usually different wallets, and
 * conflating them is what makes a market maker look like a cluster.
 */
export function statsFromTrades(trades: readonly ScorableTrade[]): TraderStats {
    const byTrader = new Map<string, { n: number; usd: number; buys: number; sells: number }>();
    let volumeUsd = 0;

    for (const t of trades) {
        if (!t.account) continue;
        const usd = Number.isFinite(t.usdValue ?? NaN) ? Math.abs(t.usdValue as number) : 0;
        volumeUsd += usd;
        const cur = byTrader.get(t.account) ?? { n: 0, usd: 0, buys: 0, sells: 0 };
        cur.n += 1;
        cur.usd += usd;
        if (t.isBuy) cur.buys += 1;
        else cur.sells += 1;
        byTrader.set(t.account, cur);
    }

    const perTrader = [...byTrader.values()];
    const busiest = [...perTrader].sort((a, b) => b.n - a.n).slice(0, 5);
    const largest = [...perTrader].sort((a, b) => b.usd - a.usd).slice(0, 5);

    return {
        trades: perTrader.reduce((s, t) => s + t.n, 0),
        traders: perTrader.length,
        top5Trades: busiest.reduce((s, t) => s + t.n, 0),
        roundTripTraders: perTrader.filter((t) => t.buys > 0 && t.sells > 0).length,
        volumeUsd,
        top5VolumeUsd: largest.reduce((s, t) => s + t.usd, 0),
    };
}

/**
 * Never throws and never divides by zero — this runs over provider data that is
 * routinely absent, and a coin with no recorded trades must come back
 * "no verdict", not "clean" and not "washy".
 */
export function traderConcentration(stats: TraderStats | null | undefined): Concentration {
    const empty: Concentration = {
        top5SharePct: 0,
        top5VolumeSharePct: null,
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

    // Volume share is computed when there is priced volume to compute it from,
    // and is otherwise null rather than 0 — "we don't know" and "nobody holds
    // any of it" are different answers.
    const volumeUsd = stats.volumeUsd;
    const top5VolumeUsd = stats.top5VolumeUsd;
    const top5VolumeSharePct =
        Number.isFinite(volumeUsd) && (volumeUsd as number) > 0 && Number.isFinite(top5VolumeUsd)
            ? (Math.min(top5VolumeUsd as number, volumeUsd as number) / (volumeUsd as number)) * 100
            : null;
    const roundTripPct = (Math.min(roundTripTraders, traders) / traders) * 100;
    const tradesPerTrader = trades / traders;

    // Fail OPEN below the floor, like every other gate in this feed: a quiet
    // coin is not a suspicious one, and refusing to judge is the honest answer.
    const hasVerdict = trades >= MIN_TRADES_FOR_VERDICT;

    return {
        top5SharePct,
        top5VolumeSharePct,
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
