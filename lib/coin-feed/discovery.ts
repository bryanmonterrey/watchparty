// Discovery: decides WHICH coins the alert feed watches.
//
// Two sources feed `tracked_tokens`:
//   1. GeckoTerminal trending + new pools, per enabled network — this is the
//      "track every good coin" half. A pool is adopted only if it clears the
//      network's liquidity/volume floors, so the rail isn't a rug firehose.
//   2. Every LIVE watchparty launch — mirrored in with wp_token_id set, so our
//      own coins get cluster alerts on the same code path and the rail can
//      deep-link to the native coin page instead of an explorer.
//
// Also prunes: a coin that has gone quiet stops costing us a scan slot.

import { db } from "@/db";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { tokens } from "@/db/schema/content/token";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { CallBudget, fetchNewPools, fetchTrendingPools, type DiscoveredPool } from "./geckoterminal";
import { enabledNetworks, networkById, trackedTokenId } from "./networks";

/** A coin with no scan-worthy activity for this long is dropped (unless pinned
 *  or one of ours). Keeps the round-robin scan pointed at things that move. */
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
/** Ceiling on the watch list. This number IS the alert-latency dial: a pass
 *  scans at most `GT_CALL_BUDGET` (24) coins per minute, so N tracked means a
 *  worst-case cycle of N/24 minutes. At 300 that's ~12 min worst case, and much
 *  better than that for high-volume coins, which the scan's staleness×volume
 *  ordering reaches far more often. Raising this trades alert freshness for
 *  breadth — a paid GeckoTerminal key is the real way to buy both. */
const MAX_TRACKED = 300;

/** Adopt a discovered pool? Floors are per-network (see networks.ts). */
function qualifies(pool: DiscoveredPool): boolean {
    const net = networkById(pool.network);
    if (!net) return false;
    const liquidity = pool.liquidityUsd ?? 0;
    const volume = pool.volume24hUsd ?? 0;
    return liquidity >= net.minLiquidityUsd && volume >= net.minVolume24hUsd;
}

/** Upsert pools into the watch list, refreshing cached market columns.
 *  Conflicts on (network, pool_address) — the same coin re-discovered next pass
 *  updates in place rather than duplicating. */
async function upsertPools(pools: DiscoveredPool[]): Promise<number> {
    if (pools.length === 0) return 0;

    // Collapse duplicates within the batch (trending and new_pools overlap):
    // ON CONFLICT cannot fire twice for the same key in one statement.
    const byKey = new Map<string, DiscoveredPool>();
    for (const p of pools) byKey.set(`${p.network}:${p.poolAddress}`, p);
    const rows = [...byKey.values()];

    await db
        .insert(trackedTokens)
        .values(
            rows.map((p) => ({
                id: trackedTokenId(p.network, p.tokenAddress),
                network: p.network,
                tokenAddress: p.tokenAddress,
                poolAddress: p.poolAddress,
                dexId: p.dexId,
                symbol: p.symbol,
                name: p.name,
                imageUrl: p.imageUrl,
                priceUsd: p.priceUsd,
                marketCapUsd: p.marketCapUsd,
                liquidityUsd: p.liquidityUsd,
                volume24hUsd: p.volume24hUsd,
                priceChange5m: p.priceChange5m,
                priceChange1h: p.priceChange1h,
                priceChange24h: p.priceChange24h,
                lastSyncedAt: new Date(),
            })),
        )
        .onConflictDoUpdate({
            target: [trackedTokens.network, trackedTokens.poolAddress],
            set: {
                symbol: sql`excluded.symbol`,
                name: sql`excluded.name`,
                // Keep the image we already have if GT hands back nothing this pass.
                imageUrl: sql`coalesce(excluded.image_url, ${trackedTokens.imageUrl})`,
                priceUsd: sql`excluded.price_usd`,
                marketCapUsd: sql`excluded.market_cap_usd`,
                liquidityUsd: sql`excluded.liquidity_usd`,
                volume24hUsd: sql`excluded.volume_24h_usd`,
                priceChange5m: sql`excluded.price_change_5m`,
                priceChange1h: sql`excluded.price_change_1h`,
                priceChange24h: sql`excluded.price_change_24h`,
                lastSyncedAt: sql`excluded.last_synced_at`,
                updatedAt: new Date(),
            },
        });

    return rows.length;
}

/** Mirror watchparty's live launches into the watch list so they ride the same
 *  scan loop. Their market columns keep coming from lib/tokens/market-sync.ts
 *  (Meteora curve state included), so this only syncs identity + the wp link. */
export async function syncWatchpartyTokens(): Promise<number> {
    const rows = await db
        .select({
            id: tokens.id,
            tokenAddress: tokens.tokenAddress,
            poolAddress: tokens.poolAddress,
            ticker: tokens.ticker,
            name: tokens.name,
            imageUrl: tokens.imageUrl,
            priceUsd: tokens.priceUsd,
            marketCapUsd: tokens.marketCapUsd,
            volume24hUsd: tokens.volume24hUsd,
            priceChange5m: tokens.priceChange5m,
            priceChange1h: tokens.priceChange1h,
            priceChange24h: tokens.priceChange24h,
        })
        .from(tokens)
        .where(and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress), isNotNull(tokens.tokenAddress)));

    if (rows.length === 0) return 0;

    await db
        .insert(trackedTokens)
        .values(
            rows.map((t) => ({
                id: trackedTokenId("solana", t.tokenAddress!),
                network: "solana",
                tokenAddress: t.tokenAddress!,
                poolAddress: t.poolAddress!,
                dexId: "meteora",
                symbol: t.ticker.toUpperCase(),
                name: t.name,
                imageUrl: t.imageUrl,
                wpTokenId: t.id,
                // Ours are never pruned — a quiet watchparty coin still belongs
                // in the rail the moment it moves.
                pinned: true,
                priceUsd: t.priceUsd,
                marketCapUsd: t.marketCapUsd,
                volume24hUsd: t.volume24hUsd,
                priceChange5m: t.priceChange5m,
                priceChange1h: t.priceChange1h,
                priceChange24h: t.priceChange24h,
                lastSyncedAt: new Date(),
            })),
        )
        .onConflictDoUpdate({
            target: [trackedTokens.network, trackedTokens.poolAddress],
            set: {
                symbol: sql`excluded.symbol`,
                name: sql`excluded.name`,
                imageUrl: sql`coalesce(excluded.image_url, ${trackedTokens.imageUrl})`,
                wpTokenId: sql`excluded.wp_token_id`,
                pinned: sql`true`,
                priceUsd: sql`excluded.price_usd`,
                marketCapUsd: sql`excluded.market_cap_usd`,
                volume24hUsd: sql`excluded.volume_24h_usd`,
                priceChange5m: sql`excluded.price_change_5m`,
                priceChange1h: sql`excluded.price_change_1h`,
                priceChange24h: sql`excluded.price_change_24h`,
                lastSyncedAt: sql`excluded.last_synced_at`,
                updatedAt: new Date(),
            },
        });

    return rows.length;
}

/** Drop coins that stopped mattering: never-scanned rows are exempt (they just
 *  arrived), pinned and watchparty coins are exempt permanently. */
async function pruneStale(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const deleted = await db
        .delete(trackedTokens)
        .where(
            and(
                eq(trackedTokens.pinned, false),
                isNull(trackedTokens.wpTokenId),
                lt(trackedTokens.lastScanAt, cutoff),
                // Quiet on both axes — a coin still doing volume stays even if
                // it hasn't produced a cluster.
                or(isNull(trackedTokens.lastTradeAt), lt(trackedTokens.lastTradeAt, cutoff)),
            ),
        )
        .returning({ id: trackedTokens.id });
    return deleted.length;
}

/** Trim the watch list back to MAX_TRACKED, dropping the thinnest coins first,
 *  so per-coin scan frequency stays high enough to actually catch clusters. */
async function enforceCap(): Promise<number> {
    const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trackedTokens);
    if (count <= MAX_TRACKED) return 0;

    const overflow = await db
        .select({ id: trackedTokens.id })
        .from(trackedTokens)
        .where(and(eq(trackedTokens.pinned, false), isNull(trackedTokens.wpTokenId)))
        .orderBy(sql`coalesce(${trackedTokens.volume24hUsd}, 0) asc`)
        .limit(count - MAX_TRACKED);
    if (overflow.length === 0) return 0;

    // inArray, not a raw `in ${array}` — drizzle binds a JS array as ONE
    // parameter, which Postgres rejects for IN.
    await db.delete(trackedTokens).where(inArray(trackedTokens.id, overflow.map((r) => r.id)));
    return overflow.length;
}

export type DiscoveryResult = {
    discovered: number;
    watchparty: number;
    pruned: number;
    trimmed: number;
};

/**
 * One discovery pass. Costs 2 GT calls per enabled network (trending + new),
 * so it runs on a slower cadence than the trade scan — see the cron route.
 */
export async function runDiscovery(budget: CallBudget): Promise<DiscoveryResult> {
    const found: DiscoveredPool[] = [];

    for (const net of enabledNetworks()) {
        if (budget.remaining < 2) break;
        const [trending, fresh] = await Promise.all([
            fetchTrendingPools(net.id, budget),
            fetchNewPools(net.id, budget),
        ]);
        found.push(...trending.filter(qualifies), ...fresh.filter(qualifies));
    }

    const discovered = await upsertPools(found);
    const watchparty = await syncWatchpartyTokens();
    const pruned = await pruneStale();
    const trimmed = await enforceCap();

    return { discovered, watchparty, pruned, trimmed };
}
