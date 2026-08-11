// Cluster detection — the thing that turns raw swaps into "20 traders bought
// $40.3K". This is the heart of the alert feed.
//
// Per tracked coin: pull recent swaps, drop everything at or before the coin's
// watermark (so a trade is only ever considered once), then slide a window over
// each side independently. A window that clears BOTH thresholds — enough
// DISTINCT wallets and enough total USD — becomes one event. Windows are
// consumed non-overlapping, so a ten-minute surge is one alert, not forty.
//
// Single outsized fills skip the clustering entirely and land as whale events.

import { db } from "@/db";
import { coinFeedEvents, trackedTokens, type CoinFeedTrader, type NewCoinFeedEvent } from "@/db/schema/content/coin-feed";
import { deliverCommunityCoinAlerts } from "@/lib/coin-feed/community-alerts";
import { eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { CallBudget, fetchPoolTrades, type PoolTrade } from "./geckoterminal";
// Shared with the coin page's trades table — see lib/coins/resolve-traders.
import { resolveTraders } from "@/lib/coins/resolve-traders";

// ── Tuning ───────────────────────────────────────────────────────────────────
// These are the knobs that decide whether the rail feels alive or noisy. They
// are deliberately in one block: at launch volumes MIN_TRADERS has to be low to
// produce anything at all, and it should climb as the tracked set grows.

/** Dust floor. Also passed to GeckoTerminal so it filters server-side — dust
 *  would otherwise inflate a cluster's trader count with bot wallets. */
const MIN_TRADE_USD = 250;
/** How wide a "burst" is. Wider = more traders per cluster but staler alerts. */
const CLUSTER_WINDOW_MS = 15 * 60 * 1000;
/** Distinct wallets needed on one side inside the window. fomo shows 20+, but
 *  that is against a mature tracked set — start lower and raise it. */
const MIN_TRADERS = 6;
/** Total USD needed alongside the trader count. Both must clear. */
const MIN_CLUSTER_USD = 7_500;
/** A single fill this big is its own event, no clustering needed. */
const WHALE_USD = 25_000;
/** Avatars kept on the row's stack. The rail renders three. */
const MAX_TRADERS_STORED = 6;
/** First scan of a newly adopted coin only looks this far back, so adoption
 *  doesn't dump a day of historical clusters into the rail at once. */
const COLD_START_LOOKBACK_MS = CLUSTER_WINDOW_MS;

export type ScannableToken = {
    id: string;
    network: string;
    tokenAddress: string;
    poolAddress: string;
    symbol: string;
    imageUrl: string | null;
    wpTokenId: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    lastTradeAt: Date | null;
};

/**
 * Market cap at the moment of a trade. The cached column is a minute stale at
 * worst, but the trade carries its own price, so scaling the cached cap by the
 * price ratio recovers the cap AT THE FILL — which is what the row claims when
 * it says "at $612K MC". Falls back to the cached value when either price is
 * missing or looks degenerate.
 */
function marketCapAt(token: ScannableToken, priceUsd: number | null): number | null {
    const cap = token.marketCapUsd;
    if (cap == null) return null;
    if (priceUsd == null || token.priceUsd == null || token.priceUsd <= 0 || priceUsd <= 0) return cap;
    const scaled = cap * (priceUsd / token.priceUsd);
    return Number.isFinite(scaled) && scaled > 0 ? scaled : cap;
}

type Window = {
    side: "buy" | "sell";
    trades: PoolTrade[];
    traders: Set<string>;
    usd: number;
    startAt: Date;
    endAt: Date;
};

/**
 * Slide a CLUSTER_WINDOW_MS window over one side's trades (ascending) and yield
 * the windows that clear both thresholds. Emitted windows are consumed — the
 * walk restarts after the last trade in them — so one surge produces one alert.
 */
function findWindows(trades: PoolTrade[], side: "buy" | "sell"): Window[] {
    const sideTrades = trades.filter((t) => t.side === side).sort((a, b) => a.at.getTime() - b.at.getTime());
    const windows: Window[] = [];

    let start = 0;
    while (start < sideTrades.length) {
        const first = sideTrades[start];
        const cutoff = first.at.getTime() + CLUSTER_WINDOW_MS;

        let end = start;
        const traders = new Set<string>();
        let usd = 0;
        while (end < sideTrades.length && sideTrades[end].at.getTime() <= cutoff) {
            traders.add(sideTrades[end].trader);
            usd += sideTrades[end].usd;
            end++;
        }

        if (traders.size >= MIN_TRADERS && usd >= MIN_CLUSTER_USD) {
            windows.push({
                side,
                trades: sideTrades.slice(start, end),
                traders,
                usd,
                startAt: first.at,
                endAt: sideTrades[end - 1].at,
            });
            start = end; // consume the whole window
        } else {
            start++; // slide by one and try again
        }
    }

    return windows;
}

export type ScanResult = { events: number; tradesSeen: number; skipped?: boolean };

/**
 * Scan one coin and write any events it produced. Costs exactly one
 * GeckoTerminal call. Advances the coin's watermark + scan cursor when the call
 * SUCCEEDED — even if it found nothing — so the queue keeps moving.
 */
export async function scanToken(token: ScannableToken, budget: CallBudget): Promise<ScanResult> {
    const trades = await fetchPoolTrades(token.network, token.poolAddress, budget, MIN_TRADE_USD);

    // null = the request failed (429/timeout), NOT "no trades". Leave both
    // cursors untouched so this coin is retried next pass instead of being
    // recorded as freshly scanned and demoted in the priority ordering.
    if (trades === null) return { events: 0, tradesSeen: 0, skipped: true };

    const now = new Date();
    if (trades.length === 0) {
        await db
            .update(trackedTokens)
            .set({ lastScanAt: now })
            .where(eq(trackedTokens.id, token.id));
        return { events: 0, tradesSeen: 0 };
    }

    // Cold start: a coin adopted this pass has no watermark, so look back only
    // one window instead of GT's full 24h of history.
    const watermark = token.lastTradeAt ?? new Date(now.getTime() - COLD_START_LOOKBACK_MS);
    const fresh = trades.filter((t) => t.at.getTime() > watermark.getTime());
    const newest = trades.reduce((max, t) => (t.at.getTime() > max.getTime() ? t.at : max), watermark);

    if (fresh.length === 0) {
        await db
            .update(trackedTokens)
            .set({ lastScanAt: now, lastTradeAt: newest })
            .where(eq(trackedTokens.id, token.id));
        return { events: 0, tradesSeen: 0 };
    }

    const whales = fresh.filter((t) => t.usd >= WHALE_USD);
    // A whale fill is its own event; leaving it in the pool would also let one
    // wallet carry a cluster's USD threshold on its own.
    const clusterable = fresh.filter((t) => t.usd < WHALE_USD);
    const windows = [...findWindows(clusterable, "buy"), ...findWindows(clusterable, "sell")];

    // One identity lookup for the whole coin, not one per window.
    const addresses = [
        ...new Set([...windows.flatMap((w) => [...w.traders]), ...whales.map((t) => t.trader)]),
    ];
    const identities = await resolveTraders(addresses);

    const rows: NewCoinFeedEvent[] = [];

    for (const w of windows) {
        // Biggest buyers first — the stack should show who actually moved size.
        const ranked = [...w.traders]
            .map((addr) => ({
                addr,
                usd: w.trades.filter((t) => t.trader === addr).reduce((s, t) => s + t.usd, 0),
            }))
            .sort((a, b) => b.usd - a.usd)
            .slice(0, MAX_TRADERS_STORED);

        const last = w.trades[w.trades.length - 1];
        rows.push({
            id: nanoid(),
            kind: w.side === "buy" ? "cluster_buy" : "cluster_sell",
            network: token.network,
            trackedTokenId: token.id,
            wpTokenId: token.wpTokenId,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            tokenImageUrl: token.imageUrl,
            side: w.side,
            traderCount: w.traders.size,
            usdValue: w.usd,
            marketCapUsd: marketCapAt(token, last.priceUsd),
            traders: ranked.map((r) => identities.get(r.addr) ?? { address: r.addr }),
            // Keyed on the window's closing tx: deterministic, so a retried pass
            // that recomputes the same window collides instead of duplicating.
            dedupeKey: `cluster:${token.id}:${w.side}:${last.txHash}`,
            occurredAt: w.endAt,
        });
    }

    for (const t of whales) {
        rows.push({
            id: nanoid(),
            kind: t.side === "buy" ? "whale_buy" : "whale_sell",
            network: token.network,
            trackedTokenId: token.id,
            wpTokenId: token.wpTokenId,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            tokenImageUrl: token.imageUrl,
            side: t.side,
            traderCount: 1,
            usdValue: t.usd,
            marketCapUsd: marketCapAt(token, t.priceUsd),
            traders: [identities.get(t.trader) ?? { address: t.trader }],
            dedupeKey: `whale:${token.id}:${t.txHash}`,
            occurredAt: t.at,
        });
    }

    if (rows.length > 0) {
        await db.insert(coinFeedEvents).values(rows).onConflictDoNothing({ target: coinFeedEvents.dedupeKey });
        // Bot-managed community coin alerts (best-effort, never blocks the sweep).
        void deliverCommunityCoinAlerts(rows);
    }

    // Watermark last: if the insert above threw we want the next pass to retry
    // this range rather than silently skip it (dedupeKey makes that safe).
    await db
        .update(trackedTokens)
        .set({ lastScanAt: now, lastTradeAt: newest })
        .where(eq(trackedTokens.id, token.id));

    return { events: rows.length, tradesSeen: fresh.length };
}

/**
 * Priority scan: one GT call per coin until the pass's budget runs out.
 *
 * Ordering is staleness × importance rather than plain round-robin. A pass can
 * only reach `budget` coins, so with N tracked the naive cycle time is N/budget
 * MINUTES — at N=300 that's ~12 min, which is far too slow for a $50M-volume
 * coin and far too fast for a $60k one. Weighting by ln(volume) spends the
 * budget where clusters actually form, while staleness still grows without
 * bound, so no coin is ever starved completely.
 */
export async function runClusterScan(
    budget: CallBudget,
): Promise<{ scanned: number; events: number; skipped: number; rateLimited: boolean }> {
    const limit = budget.remaining;
    if (limit <= 0) return { scanned: 0, events: 0, skipped: 0, rateLimited: budget.rateLimited };

    const rows = await db
        .select({
            id: trackedTokens.id,
            network: trackedTokens.network,
            tokenAddress: trackedTokens.tokenAddress,
            poolAddress: trackedTokens.poolAddress,
            symbol: trackedTokens.symbol,
            imageUrl: trackedTokens.imageUrl,
            wpTokenId: trackedTokens.wpTokenId,
            priceUsd: trackedTokens.priceUsd,
            marketCapUsd: trackedTokens.marketCapUsd,
            lastTradeAt: trackedTokens.lastTradeAt,
        })
        .from(trackedTokens)
        .orderBy(
            // Never-scanned coins get a full day of implied staleness so they
            // are picked up on the pass right after discovery adopts them.
            sql`extract(epoch from (now() - coalesce(${trackedTokens.lastScanAt}, now() - interval '1 day')))
                * ln(greatest(coalesce(${trackedTokens.volume24hUsd}, 0), 1000)) desc`,
        )
        .limit(limit);

    let scanned = 0;
    let events = 0;
    let skipped = 0;
    for (const row of rows) {
        // Stop the moment the provider starts refusing — the rest of the pass
        // would just be 429s, and each one would look like a coin with no
        // trades.
        if (budget.remaining <= 0 || budget.rateLimited) break;
        try {
            const res = await scanToken(row, budget);
            events += res.events;
            if (res.skipped) skipped++;
            else scanned++;
        } catch (err) {
            console.error(`[coin-feed] scan failed for ${row.id}:`, err);
        }
    }

    return { scanned, events, skipped, rateLimited: budget.rateLimited };
}
