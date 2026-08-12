import "server-only";

import { db } from "@/db";
import { coinTrades } from "@/db/schema/content/coin-trades";
import { updateCandlesFromTrades } from "@/lib/coins/candles-from-trades";
import { lookupPoolAddress } from "@/lib/coins/pool-lookup";
import type { MobulaTrade } from "@/lib/coins/mobula";

/**
 * Write Mobula's trades onto our tape, and advance the chart from the ones that
 * were genuinely new.
 *
 * ## Why this exists: liveness without a live connection
 *
 * `subscribeCandles` drives the chart off postgres_changes on `coin_candles`, so
 * an open chart moves whenever a candle ROW is written. That made liveness cost
 * a database write instead of an API call — and the writer was the Helius trades
 * webhook, which is exactly what must not be powering a coin page.
 *
 * The replacement costs nothing to run. The coin page already fetches Mobula's
 * trades every 30 seconds for the table under the chart; those trades carry
 * `marketAddress` and `baseTokenPriceUSD`, which is everything a bar needs. So
 * the same paid request now advances the candle it always could have.
 *
 * What that buys, concretely: the chart's current bar moves on the trades feed's
 * cadence instead of on the 5-minute OHLCV cache, and the UDF's DB-first branch
 * starts hitting again — so history reads stop paying Mobula's 5-credit
 * ohlcv-history call for a coin somebody is actively watching.
 *
 * ## Exactly-once, because volume ACCUMULATES
 *
 * `updateCandlesFromTrades` merges with `v = v + excluded.v`. Re-projecting a
 * trade therefore inflates the bar's volume, and this path is a POLL — every
 * 30-second fetch re-reads the same recent trades, so nearly every row it sees
 * has already been counted.
 *
 * The insert is the deduplicator. `coin_trades` is keyed on (signature,
 * poolAddress), so `onConflictDoNothing().returning()` hands back precisely the
 * rows that did not exist yet, and only those reach the projection. That is the
 * same guarantee the Helius path relied on, obtained the same way — not a
 * watermark, which would drop trades sharing the newest timestamp.
 *
 * ## It shares `coin_candles` with the provider's own bars, and that is fine
 *
 * `writeCandles` (used by the UDF when it fetches ohlcv-history) REPLACES a
 * bar outright, including volume; this path ADDS to it. So on the one bar that
 * is still open they can disagree: if a provider bar lands first, the trades it
 * already contains get added again and the open bar's volume reads high until
 * the next provider fetch replaces it wholesale. Bounded to the current bar,
 * self-correcting, and the alternative was a chart that does not move.
 *
 * ## Same table the alert scanner reads
 *
 * `lib/coin-feed/clusters` scans `coin_trades`, so a coin someone is looking at
 * starts contributing whale/cluster events from MOBULA data. That is the first
 * step off the Helius tape for alerts too — the difference being that alerts
 * genuinely need a push (nobody is holding that page open), which is what the
 * Tape DO is for.
 *
 * ## Everything is keyed to OUR pool address, not Mobula's `marketAddress`
 *
 * This is the difference between the feature working and looking like it works.
 * Mobula's trades endpoint is per TOKEN and each row carries the venue it
 * executed on, so one coin's trades arrive spread across several
 * `marketAddress` values. Every consumer here is keyed to the pool address in
 * OUR tables instead:
 *
 *   - the chart subscribes to `coin_candles` for `coin.poolAddress`
 *     (components/coins/coin-detail.tsx passes it straight through);
 *   - the UDF's stored-candle read resolves the pool with `lookupPoolAddress`;
 *   - the alert scanner reads the tape by `trackedTokens.poolAddress`.
 *
 * Writing under the per-trade venue would satisfy the type checker, write real
 * rows, fire real Realtime events — and none of them would reach any of those
 * three, because they are all listening on a different key. The bars would also
 * fragment across venues, so no single series would hold the coin's volume.
 *
 * A coin we have no pool for is SKIPPED rather than written under the venue: it
 * would be orphan data by construction, since the readers cannot ask for a key
 * they can't derive.
 */
export async function recordMobulaTrades(
    network: string,
    tokenAddress: string,
    trades: readonly MobulaTrade[],
): Promise<{ inserted: number; bars: number }> {
    const pool = await lookupPoolAddress(tokenAddress, network);
    if (!pool) return { inserted: 0, bars: 0 };

    const rows = trades
        .filter((t) => t.txHash && t.priceUsd && t.priceUsd > 0 && t.ts > 0)
        .map((t) => ({
            network,
            poolAddress: pool,
            tokenAddress,
            signature: t.txHash,
            ts: t.ts,
            trader: t.account,
            side: t.isBuy ? "buy" : "sell",
            amountToken: Number.isFinite(t.tokenAmount) ? Math.abs(t.tokenAmount) : null,
            amountUsd: Number.isFinite(t.usdValue) ? Math.abs(t.usdValue) : null,
            priceUsd: t.priceUsd!,
        }));
    if (!rows.length) return { inserted: 0, bars: 0 };

    // Postgres rejects an INSERT that touches the same conflict target twice
    // ("cannot affect row a second time"), so the batch has to be unique before
    // it is sent. Two shapes collapse here: a genuine repeat, and one routed
    // transaction that swapped through several VENUES for this token — those
    // arrive as separate Mobula rows and become one row under our single pool
    // key, so the extra legs' volume is dropped. That is the cost of keying the
    // series to the pool the chart actually subscribes to, and it is a rounding
    // error next to the series not existing.
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
        const key = `${r.signature}|${r.poolAddress}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const inserted = await db
        .insert(coinTrades)
        .values(unique)
        .onConflictDoNothing()
        .returning({
            poolAddress: coinTrades.poolAddress,
            ts: coinTrades.ts,
            priceUsd: coinTrades.priceUsd,
            amountToken: coinTrades.amountToken,
        });
    if (!inserted.length) return { inserted: 0, bars: 0 };

    const bars = await updateCandlesFromTrades(
        inserted.map((r) => ({
            network,
            poolAddress: r.poolAddress,
            ts: r.ts,
            priceUsd: r.priceUsd ?? 0,
            amountToken: r.amountToken,
        })),
    );

    return { inserted: inserted.length, bars };
}
