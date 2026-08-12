import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { coinTrades } from "@/db/schema/content/coin-trades";
import { getMintPriceMap, WSOL_MINT } from "@/server/lib/mint-prices";
import { tradePriceUsd, updateCandlesFromTrades } from "@/lib/coins/candles-from-trades";

/**
 * Turn Helius enhanced-webhook SWAP events into rows on the public tape.
 *
 * Helius has been pushing every one of these to /api/webhooks/helius-trades
 * since the pool webhook was registered; the route used them to refresh a price
 * row and dropped them. Writing them down is what lets the transactions table
 * stop polling: rows land ~1-2s after a swap confirms and ride Supabase
 * Realtime to every open chart.
 *
 * The enhanced payload is already PARSED — `events.swap` carries the legs with
 * mints and decimals — so nothing here decodes instruction data. That is the
 * entire reason this is a small file and not a week of Raydium/Meteora layouts.
 */

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

type SwapLeg = {
    mint?: string;
    tokenAmount?: number | string;
    rawTokenAmount?: { tokenAmount?: string; decimals?: number };
    userAccount?: string;
};

export type HeliusSwapEvent = {
    signature?: string;
    type?: string;
    timestamp?: number;
    feePayer?: string;
    accountData?: { account?: string }[];
    events?: {
        swap?: {
            nativeInput?: { account?: string; amount?: string } | null;
            nativeOutput?: { account?: string; amount?: string } | null;
            tokenInputs?: SwapLeg[];
            tokenOutputs?: SwapLeg[];
        };
    };
};

/** A leg's human amount, from either shape Helius uses. */
function legAmount(leg: SwapLeg): number | null {
    if (leg.tokenAmount !== undefined && leg.tokenAmount !== null) {
        const n = Number(leg.tokenAmount);
        return Number.isFinite(n) ? n : null;
    }
    const raw = leg.rawTokenAmount;
    if (raw?.tokenAmount !== undefined && raw.decimals !== undefined) {
        const n = Number(raw.tokenAmount) / 10 ** raw.decimals;
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Record swaps for pools we watch.
 *
 * `poolsByAddress` maps a watched pool address → the token it trades, so a
 * transaction touching several pools produces one row per pool rather than one
 * per transaction. Returns how many rows were written.
 */
export async function recordSwaps(
    events: HeliusSwapEvent[],
    poolsByAddress: Map<string, { network: string; tokenAddress: string }>,
): Promise<number> {
    if (poolsByAddress.size === 0) return 0;

    // Priced off the SOL leg for the common case. One lookup for the batch —
    // this runs on every webhook delivery, so a per-event price call would be
    // the most expensive thing in the request.
    let solPrice: number | null = null;
    try {
        solPrice = (await getMintPriceMap([WSOL_MINT])).get(WSOL_MINT)?.priceUsd ?? null;
    } catch {
        // Unpriced rows are still worth having — the table shows amounts and
        // the chart is unaffected. Better a tape with gaps in the USD column
        // than no tape.
    }

    type Row = typeof coinTrades.$inferInsert;
    const rows: Row[] = [];

    for (const ev of events) {
        const swap = ev.events?.swap;
        if (!swap || !ev.signature || !ev.feePayer) continue;

        // Which watched pools did this transaction touch?
        const touchedPools = (ev.accountData ?? [])
            .map((a) => a.account)
            .filter((a): a is string => !!a && poolsByAddress.has(a));
        if (touchedPools.length === 0) continue;

        const ts = ev.timestamp ?? Math.floor(Date.now() / 1000);
        const inputs = swap.tokenInputs ?? [];
        const outputs = swap.tokenOutputs ?? [];

        // Native SOL legs are reported separately from token legs.
        const nativeIn = swap.nativeInput?.amount ? Number(swap.nativeInput.amount) / 1e9 : 0;
        const nativeOut = swap.nativeOutput?.amount ? Number(swap.nativeOutput.amount) / 1e9 : 0;

        for (const pool of touchedPools) {
            const meta = poolsByAddress.get(pool)!;
            const mint = meta.tokenAddress;

            const outLeg = outputs.find((l) => l.mint === mint);
            const inLeg = inputs.find((l) => l.mint === mint);
            // The tracked token leaving the pool to the trader is a BUY.
            const side = outLeg ? "buy" : inLeg ? "sell" : null;
            if (!side) continue;

            const amountToken = legAmount(outLeg ?? inLeg!);
            if (amountToken === null || amountToken <= 0) continue;

            // Value the OTHER side of the trade — that's what the token was
            // actually worth in this transaction.
            let amountUsd: number | null = null;
            const cashLegs = side === "buy" ? inputs : outputs;
            const stable = cashLegs.find((l) => l.mint === USDC || l.mint === USDT);
            const wsol = cashLegs.find((l) => l.mint === WSOL_MINT);
            const nativeLeg = side === "buy" ? nativeIn : nativeOut;

            if (stable) {
                amountUsd = legAmount(stable);
            } else if (wsol && solPrice) {
                const a = legAmount(wsol);
                amountUsd = a === null ? null : a * solPrice;
            } else if (nativeLeg > 0 && solPrice) {
                amountUsd = nativeLeg * solPrice;
            }

            rows.push({
                network: meta.network,
                poolAddress: pool,
                tokenAddress: mint,
                signature: ev.signature,
                ts,
                trader: ev.feePayer,
                side,
                amountToken,
                amountUsd,
                priceUsd: amountUsd !== null && amountToken > 0 ? amountUsd / amountToken : null,
            });
        }
    }

    if (rows.length === 0) return 0;

    // Helius retries deliveries, so the same signature arrives more than once.
    // DO NOTHING rather than DO UPDATE: the first write is already correct and
    // a re-write would fire a second Realtime event, double-printing the row in
    // every open table.
    await db.insert(coinTrades).values(rows).onConflictDoNothing();

    // Advance the CHART from the same trades.
    //
    // `subscribeCandles` drives live bars off postgres_changes on
    // `coin_candles`, so an open chart moves when a candle row is written —
    // liveness costs a database write, never an API call. Until 0c1d2b29 the
    // only writer was a GeckoTerminal poll; with that gone, a chart would load
    // its history and then sit still.
    //
    // Deriving the bar here is both free and faster than what it replaces: a
    // synced candle appeared on the next cron pass, this one lands 1-2 seconds
    // behind the swap.
    //
    // Best-effort. The tape is the source of truth and a candle is a
    // projection of it — failing to project must never lose the trade.
    try {
        await updateCandlesFromTrades(
            rows
                .map((r) => ({
                    network: r.network,
                    poolAddress: r.poolAddress,
                    ts: r.ts,
                    priceUsd: tradePriceUsd(r.amountUsd ?? null, r.amountToken ?? null) ?? 0,
                    amountToken: r.amountToken ?? null,
                }))
                .filter((t) => t.priceUsd > 0),
        );
    } catch (err) {
        console.error("[record-swaps] candle projection failed:", err instanceof Error ? err.message : err);
    }

    return rows.length;
}

/**
 * Trim the tape. This is a live feed, not an archive — nothing reads back past
 * the visible window, and the table takes every swap on every watched pool.
 */
export async function pruneTrades(olderThanSeconds = 60 * 60 * 24 * 2): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
    await db.delete(coinTrades).where(sql`${coinTrades.ts} < ${cutoff}`);
}
