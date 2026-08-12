import "server-only";

import { db } from "@/db";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { sql } from "drizzle-orm";
import { fetchMobulaTokenTrades, mobulaEnabled } from "@/lib/coins/mobula";
import { recordMobulaTrades } from "@/lib/coins/record-mobula-trades";

/**
 * Fill the alert scanner's tape from MOBULA instead of the Helius webhook.
 *
 * ## Why this is a pull, when everything else here is a push
 *
 * `lib/coin-feed/clusters` reads `coin_trades`; it does not care who wrote it.
 * Today the writers are the Helius trades webhook (push) and, for coins someone
 * has open, the coin page (`recordMobulaTrades`). Alerts are about coins NOBODY
 * has open, so the page path cannot cover them — which is why the webhook was
 * the last piece of Helius left in this app's market data.
 *
 * Mobula's push equivalent is the `Tape` DO, and its socket is gated on the
 * Growth plan. This is the path that works without it: poll the coins the
 * scanner is about to look at anyway.
 *
 * ## The cadence is arithmetic, not preference
 *
 * One coin costs one credit (`/2/token/trades`, verified: `x-ratelimit-cost: 1`).
 * The free plan is 10,000 credits a month:
 *
 *     10,000 / 30 days / 24 h = 13.9 coins per HOUR
 *
 * So the defaults below pull 1 coin per pass on a 5-minute stride — 12/hour,
 * ~8,640/month, inside the plan with room for the coin pages and the board.
 * On the $50 Start-up plan (125,000) the same arithmetic allows ~173/hour: set
 * `MOBULA_TAPE_COINS_PER_PASS=12` and it fills the whole watch list hourly.
 *
 * Deliberately NOT sized off `MOBULA_PLAN`: that variable switches cache
 * cadences, and coupling a spend loop to it means one edit silently multiplies
 * two different budgets. This one is explicit.
 *
 * ## Which coins, and why the same ordering as the scan
 *
 * The scanner's own priority — staleness weighted by log volume — so the coin
 * whose tape we fill is the coin about to be scanned. Filling a different set
 * would spend credits writing trades nothing reads this pass.
 */

/** Coins per pass. 1 fits the free plan; see the arithmetic above. */
const COINS_PER_PASS = Math.max(0, Number(process.env.MOBULA_TAPE_COINS_PER_PASS ?? 1) || 0);

/** Only run on minutes divisible by this, so a per-minute cron doesn't 60x the spend. */
const STRIDE_MIN = Math.max(1, Number(process.env.MOBULA_TAPE_STRIDE_MIN ?? 5) || 5);

export interface TapePullResult {
    /** Coins whose trades were fetched. */
    pulled: number;
    /** Rows newly written to `coin_trades`. */
    wrote: number;
    /** Coins the provider refused (429) — see the free-tier throttle note. */
    refused: number;
    skipped?: string;
}

export async function pullMobulaTape(minute: number): Promise<TapePullResult> {
    const base = { pulled: 0, wrote: 0, refused: 0 };
    if (!mobulaEnabled()) return { ...base, skipped: "mobula disabled" };
    if (COINS_PER_PASS === 0) return { ...base, skipped: "MOBULA_TAPE_COINS_PER_PASS=0" };
    if (minute % STRIDE_MIN !== 0) return { ...base, skipped: `off-stride (every ${STRIDE_MIN}m)` };

    const rows = await db
        .select({
            network: trackedTokens.network,
            tokenAddress: trackedTokens.tokenAddress,
        })
        .from(trackedTokens)
        .orderBy(
            sql`extract(epoch from (now() - coalesce(${trackedTokens.lastScanAt}, now() - interval '1 day')))
                * ln(greatest(coalesce(${trackedTokens.volume24hUsd}, 0), 1000)) desc`,
        )
        .limit(COINS_PER_PASS);

    let pulled = 0;
    let wrote = 0;
    let refused = 0;

    for (const row of rows) {
        if (!row.tokenAddress) continue;
        try {
            // Throws on 429 — deliberately not swallowed into an empty list, so
            // a refusal is counted as a refusal rather than as "this coin had
            // no trades", which is the distinction that made the coin page look
            // broken before it was fixed.
            const trades = await fetchMobulaTokenTrades(row.network, row.tokenAddress, 300);
            if (!trades?.length) continue;
            pulled++;
            const res = await recordMobulaTrades(row.network, row.tokenAddress, trades);
            wrote += res.inserted;
        } catch (err) {
            refused++;
            // One line, not a stack: on the free plan this is the expected
            // steady state (~half of requests), and the count is what matters.
            console.warn(
                `[mobula-tape] ${row.network}:${row.tokenAddress?.slice(0, 8)} refused:`,
                err instanceof Error ? err.message : err,
            );
        }
    }

    return { pulled, wrote, refused };
}
