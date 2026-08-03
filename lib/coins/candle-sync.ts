import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { coinIndex } from "@/db/schema/content/coin-index";
import { coinCandles } from "@/db/schema/content/coin-candles";
import { gtBase, gtHeaders } from "@/lib/coins/gecko-endpoint";
import { CallBudget } from "@/lib/coin-feed/geckoterminal";
import { latestCandleTs, writeCandles, type Candle, type StoredResolution } from "@/lib/coins/candles";

/**
 * Fill `coin_candles` — Phase 1 of docs/live-charts-plan.
 *
 * Runs inside the EXISTING trending-sync cron rather than adding another: that
 * pass already holds a CallBudget and already knows how to wind down when
 * GeckoTerminal rate-limits, and a second per-minute cron competing for the
 * same quota is exactly the failure this whole project is fixing.
 *
 * The read path (lib/coins/candles) serves whatever is here. If this sync stops
 * entirely, charts keep working from stored bars — they just stop advancing.
 * That separation is deliberate and is why Phase 0 shipped first.
 */

/** GT's OHLCV path segment + aggregate for each tier we store. */
const TIER: Record<StoredResolution, { unit: string; aggregate: number; seconds: number }> = {
    "1": { unit: "minute", aggregate: 1, seconds: 60 },
    "60": { unit: "hour", aggregate: 1, seconds: 3600 },
    "1D": { unit: "day", aggregate: 1, seconds: 86400 },
};

/**
 * How far back a first-ever backfill reaches, per tier. Deliberately modest:
 * one call per tier fills it, and a chart that opens on a year of 1-minute bars
 * is neither useful nor cheap.
 */
const BACKFILL_BARS = 300;

/** Retention, per tier. 1m bars are ~1,440 rows per pool per day, so this is
 *  the difference between a table that stays small and one that doesn't. */
const RETAIN_SECONDS: Record<StoredResolution, number> = {
    "1": 7 * 86400,
    "60": 90 * 86400,
    "1D": 0, // keep
};

export type CandleTarget = { network: string; poolAddress: string };

/**
 * Which pools are worth candles, most-wanted first.
 *
 * Priority is the point: quota is finite, so it goes to coins people are
 * actually looking at. The trending board first (it's the front page), then the
 * alert watch list, then coins someone opened directly. A coin nobody has ever
 * viewed doesn't need a chart history sitting in our database.
 */
export async function candleTargets(limit: number): Promise<CandleTarget[]> {
    const seen = new Set<string>();
    const out: CandleTarget[] = [];

    const push = (network: string, poolAddress: string | null) => {
        if (!poolAddress || out.length >= limit) return;
        const key = `${network}:${poolAddress}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ network, poolAddress });
    };

    const trending = await db
        .select({ network: trendingCoins.network, poolAddress: trendingCoins.poolAddress })
        .from(trendingCoins)
        .orderBy(desc(trendingCoins.volume24hUsd))
        .limit(limit);
    for (const r of trending) push(r.network, r.poolAddress);

    if (out.length < limit) {
        const tracked = await db
            .select({ network: trackedTokens.network, poolAddress: trackedTokens.poolAddress })
            .from(trackedTokens)
            .orderBy(desc(trackedTokens.volume24hUsd))
            .limit(limit);
        for (const r of tracked) push(r.network, r.poolAddress);
    }

    if (out.length < limit) {
        const indexed = await db
            .select({ network: coinIndex.network, poolAddress: coinIndex.poolAddress })
            .from(coinIndex)
            .orderBy(desc(coinIndex.resolvedAt))
            .limit(limit);
        for (const r of indexed) push(r.network, r.poolAddress);
    }

    return out;
}

const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Pull one tier for one pool and store it.
 *
 * INCREMENTAL: the newest stored bar is the cursor, so steady state asks for a
 * handful of bars rather than re-fetching a window every pass. Overlap is fine
 * and in fact wanted — re-writing the most recent bar is how the in-flight
 * candle gets corrected as it closes.
 */
async function syncTier(
    target: CandleTarget,
    resolution: StoredResolution,
    budget: CallBudget,
): Promise<number> {
    if (!budget.take()) return 0;

    const tier = TIER[resolution];
    const latest = await latestCandleTs(target.network, target.poolAddress, resolution);
    const now = Math.floor(Date.now() / 1000);

    // First time: one backfill call. After that: only what's missing, plus one
    // bar of overlap so the last (possibly unclosed) candle is refreshed.
    const limit = latest
        ? Math.min(1000, Math.max(2, Math.ceil((now - latest) / tier.seconds) + 1))
        : BACKFILL_BARS;

    const url = new URL(`${gtBase()}/networks/${target.network}/pools/${target.poolAddress}/ohlcv/${tier.unit}`);
    url.searchParams.set("aggregate", String(tier.aggregate));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("currency", "usd");
    url.searchParams.set("token", "base");

    let rows: number[][] = [];
    try {
        const res = await fetch(url.toString(), { headers: gtHeaders(), signal: AbortSignal.timeout(10_000) });
        if (res.status === 429) {
            budget.markRateLimited();
            return 0;
        }
        if (!res.ok) return 0;
        const json = await res.json();
        rows = json?.data?.attributes?.ohlcv_list ?? [];
    } catch {
        return 0;
    }

    // [ts, o, h, l, c, v], newest first.
    const candles: Candle[] = [];
    for (const r of rows) {
        const ts = num(r[0]);
        const o = num(r[1]);
        const h = num(r[2]);
        const l = num(r[3]);
        const c = num(r[4]);
        if (ts == null || o == null || h == null || l == null || c == null) continue;
        candles.push({ ts, o, h, l, c, v: num(r[5]) });
    }

    return writeCandles(target.network, target.poolAddress, resolution, candles);
}

/** Drop bars past each tier's retention window. */
export async function pruneCandles(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;
    for (const [resolution, keep] of Object.entries(RETAIN_SECONDS) as [StoredResolution, number][]) {
        if (keep === 0) continue;
        const res = await db
            .delete(coinCandles)
            .where(sql`${coinCandles.resolution} = ${resolution} and ${coinCandles.ts} < ${now - keep}`);
        removed += (res as unknown as { count?: number }).count ?? 0;
    }
    return removed;
}

export type CandleSyncResult = {
    pools: number;
    written: number;
    rateLimited: boolean;
    callsSpent: number;
};

/**
 * One pass. Spends whatever budget it's given and stops early if GT refuses —
 * the trending board's own sync has first claim on the quota, so this takes
 * what's left rather than competing for it.
 */
export async function runCandleSync(
    budget: CallBudget,
    resolutions: StoredResolution[] = ["1", "60"],
): Promise<CandleSyncResult> {
    const spentBefore = budget.spent;
    // One target per remaining call, across the tiers we're syncing.
    const targets = await candleTargets(Math.max(1, Math.floor(budget.remaining / resolutions.length)));

    let written = 0;
    for (const target of targets) {
        if (budget.remaining <= 0 || budget.rateLimited) break;
        for (const resolution of resolutions) {
            if (budget.remaining <= 0 || budget.rateLimited) break;
            written += await syncTier(target, resolution, budget);
        }
    }

    return {
        pools: targets.length,
        written,
        rateLimited: budget.rateLimited,
        callsSpent: budget.spent - spentBefore,
    };
}
