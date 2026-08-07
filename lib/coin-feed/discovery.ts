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
import { clearsBrandBar, passesSecurityBar } from "./quality";
import { fetchMobulaTokenSecurity, mobulaCadence, mobulaEnabled } from "@/lib/coins/mobula";
import { withCache } from "@/lib/cache";
import { tokens } from "@/db/schema/content/token";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { CallBudget, fetchNewPools, fetchTrendingPools, type DiscoveredPool } from "./geckoterminal";
import {
    enabledNetworks,
    EXCLUDED_SYMBOLS,
    isExcludedCoin,
    MAX_MARKET_CAP_USD,
    networkById,
    trackedTokenId,
} from "./networks";

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

/** Adopt a discovered pool? Floors are per-network (see networks.ts), and
 *  stables / wrapped majors / mega-caps are excluded outright — they always
 *  clear a trader-count threshold, so they'd fire on every scan and bury the
 *  memecoin activity the rail is for. */
function qualifies(pool: DiscoveredPool): boolean {
    const net = networkById(pool.network);
    if (!net) return false;
    if (isExcludedCoin(pool.symbol, pool.marketCapUsd)) return false;
    // Brand-squatting names ($CLAUDE, $ANTHROPIC…) clear the volume floor on
    // launch-day pumps; they get a much higher LIQUIDITY bar instead — see
    // lib/coin-feed/quality.ts.
    if (!clearsBrandBar(pool.symbol, pool.name, pool.liquidityUsd)) return false;
    const liquidity = pool.liquidityUsd ?? 0;
    const volume = pool.volume24hUsd ?? 0;
    return liquidity >= net.minLiquidityUsd && volume >= net.minVolume24hUsd;
}

/** Fresh security lookups per pass — the free Mobula key is ~1 RPS and the
 *  pass runs inside a cron route's time budget. Serial on purpose; repeats are
 *  cache hits (same key + TTL as the coin page's security card), and anything
 *  past the cap adopts unscreened this pass — fail-open, screened next time. */
const SECURITY_CHECKS_PER_PASS = 12;

/** Drop pools whose token/details security stats are KNOWN bad (honeypot,
 *  double-digit taxes, extreme sniper/insider/top-10 concentration — see
 *  quality.ts passesSecurityBar). Missing data always passes: this gate stops
 *  known rugs, it doesn't punish being new. */
async function screenSecurity(pools: DiscoveredPool[]): Promise<DiscoveredPool[]> {
    if (!mobulaEnabled() || pools.length === 0) return pools;
    const byToken = new Map<string, DiscoveredPool>();
    for (const p of pools) byToken.set(trackedTokenId(p.network, p.tokenAddress), p);

    const rejected = new Set<string>();
    let checked = 0;
    for (const [id, p] of byToken) {
        if (checked >= SECURITY_CHECKS_PER_PASS) break;
        checked++;
        try {
            const sec = await withCache(
                `coin:security:v1:${p.network}:${p.tokenAddress}`,
                mobulaCadence().securityTtl,
                () => fetchMobulaTokenSecurity(p.network, p.tokenAddress),
            );
            if (!passesSecurityBar(sec)) rejected.add(id);
        } catch {
            // 429/timeout — fail-open, retried on a later pass via cache miss.
        }
    }
    if (rejected.size > 0) console.log(`[coin-feed] security gate rejected ${rejected.size} pool(s)`);
    return pools.filter((p) => !rejected.has(trackedTokenId(p.network, p.tokenAddress)));
}

const CHUNK = 100;

/** Upsert pools into the watch list, refreshing cached market columns.
 *
 *  The row identity is the TOKEN (`network:tokenAddress`), not the pool — one
 *  coin, one row, pointing at its deepest pool. Both halves of that matter:
 *  a coin routinely has several pools, and GT hands us more than one of them
 *  (trending and new_pools overlap, and a token can trend on two DEXes at
 *  once), so the batch is collapsed per TOKEN keeping the deepest pool, and the
 *  conflict target is the primary key. Deduping per pool instead put two rows
 *  with the same id in one statement, which ON CONFLICT (network, pool_address)
 *  does not catch — it died on tracked_tokens_pkey. */
async function upsertPools(pools: DiscoveredPool[]): Promise<number> {
    if (pools.length === 0) return 0;

    const byToken = new Map<string, DiscoveredPool>();
    for (const p of pools) {
        const id = trackedTokenId(p.network, p.tokenAddress);
        const seen = byToken.get(id);
        // Deepest pool wins — it's the one whose trades represent the coin.
        if (!seen || (p.liquidityUsd ?? 0) > (seen.liquidityUsd ?? 0)) byToken.set(id, p);
    }
    const rows = [...byToken.values()];

    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
        try {
            await upsertChunk(rows.slice(i, i + CHUNK));
            written += Math.min(CHUNK, rows.length - i);
        } catch (err) {
            // One bad batch never kills the pass (same rule as market-sync).
            console.error("[coin-feed] discovery upsert chunk failed:", err);
        }
    }
    return written;
}

async function upsertChunk(rows: DiscoveredPool[]): Promise<void> {
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
            target: trackedTokens.id,
            set: {
                // The pool can move: a coin's liquidity migrates, and we always
                // want the deepest one. Conflicting on the PK (not the pool) is
                // what lets it be updated instead of colliding.
                poolAddress: sql`excluded.pool_address`,
                dexId: sql`excluded.dex_id`,
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
            // Same reasoning as upsertChunk: the row's identity is the token.
            target: trackedTokens.id,
            set: {
                poolAddress: sql`excluded.pool_address`,
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

/** Evict coins that no longer qualify — a coin that grew past the cap ceiling,
 *  or that was adopted before a symbol joined the exclusion list. Without this
 *  the filter would only apply to NEW adoptions and anything already tracked
 *  (CBBTC, in the first live pass) would keep emitting forever. */
async function evictExcluded(): Promise<number> {
    const removed = await db
        .delete(trackedTokens)
        .where(
            and(
                isNull(trackedTokens.wpTokenId), // never evict our own coins
                or(
                    inArray(trackedTokens.symbol, [...EXCLUDED_SYMBOLS]),
                    sql`${trackedTokens.marketCapUsd} > ${MAX_MARKET_CAP_USD}`,
                ),
            ),
        )
        .returning({ id: trackedTokens.id });
    return removed.length;
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
    evicted: number;
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

    const discovered = await upsertPools(await screenSecurity(found));
    const watchparty = await syncWatchpartyTokens();
    const evicted = await evictExcluded();
    const pruned = await pruneStale();
    const trimmed = await enforceCap();

    return { discovered, watchparty, evicted, pruned, trimmed };
}
