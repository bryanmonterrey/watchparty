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
import { fetchMobulaTokenSecurity, mobulaCadence, mobulaEnabled, securityCacheKey } from "@/lib/coins/mobula";
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

/** Mobula API CALLS per pass — the free key is ~1 RPS and the pass runs inside a
 *  cron route's time budget. Serial on purpose. Cache hits (same key + TTL as
 *  the coin page's security card) do NOT count against this, so a token already
 *  screened recently is re-checked for free; only genuine misses spend budget.
 *  A token whose miss falls past the cap adopts unscreened this pass and is
 *  picked up on a later one — which is now true, and wasn't when this counted
 *  lookups instead of calls (see screenSecurity). */
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
    // Counts API CALLS, not lookups.
    //
    // This used to increment once per token before the cache was consulted, so a
    // cache HIT spent budget identically to a network call. The cap exists for
    // Mobula's ~1 RPS free key, and cache hits cost Mobula nothing — but worse
    // than the waste was where the waste landed: `byToken` is built in fetch
    // order, which is the same every pass, so the first 12 tokens burned the
    // whole budget on cached reads and everything past position 12 was NEVER
    // screened. Not "screened next pass" as the comment claimed — never, because
    // the next pass made the identical choice.
    //
    // Discovery sweeps 2 enabled networks x (trending + new) and dedupes to well
    // over 12 tokens, so that tail was most of the intake, adopting with no
    // security check at all — including the mint/freeze-authority gate.
    //
    // Incrementing inside the loader means only a genuine miss counts, cached
    // tokens are all screened for free, and the cap still bounds the API calls
    // it was written to bound.
    let apiCalls = 0;
    let screened = 0;
    for (const [id, p] of byToken) {
        if (apiCalls >= SECURITY_CHECKS_PER_PASS) break;
        try {
            const sec = await withCache(
                securityCacheKey(p.network, p.tokenAddress),
                mobulaCadence().securityTtl,
                () => {
                    apiCalls++;
                    return fetchMobulaTokenSecurity(p.network, p.tokenAddress);
                },
            );
            screened++;
            if (!passesSecurityBar(sec)) rejected.add(id);
        } catch {
            // 429/timeout — fail-open, retried on a later pass via cache miss.
        }
    }
    if (screened < byToken.size) {
        console.log(
            `[coin-feed] security gate screened ${screened}/${byToken.size} (${apiCalls} api calls, cap ${SECURITY_CHECKS_PER_PASS})`,
        );
    }
    if (rejected.size > 0) console.log(`[coin-feed] security gate rejected ${rejected.size} pool(s)`);
    return pools.filter((p) => !rejected.has(trackedTokenId(p.network, p.tokenAddress)));
}

/**
 * Circuit breaker on mass eviction, with both constants taken from a measurement
 * rather than from taste.
 *
 * It exists because the failure it guards against already happened:
 * `passesSecurityBar` gated on Mobula's `securityScore`, which reads 0 for
 * perfectly healthy coins, so the predicate rejected **20 of 20** audited coins
 * (02d2d7a8). A re-screen wired at that moment would have deleted the entire
 * watch list in one pass, and the symptom — the alert rail going quiet — would
 * have surfaced days later with the cause buried four commits back.
 *
 * A full audit of all 300 tracked coins (`scripts/coin-feed/audit-security.ts`)
 * then gave the real baseline: **261 pass, 39 fail — 13.0%**, every failure a
 * genuine one-cluster coin (top10 88-100%, dev 76-93%, bundlers up to 100%).
 *
 * That measurement moved both numbers. My first attempt at this used 15%, which
 * sits directly on top of a 13% baseline: a pass screening 12 coins and failing
 * 2 is 16.7%, so the breaker would have tripped constantly during normal
 * operation and quietly stopped evicting anything — a safety device that fails
 * closed on healthy input is just an outage with a good reason.
 *
 * So: 40%, which is nowhere near 13% and nowhere near the 100% of a broken
 * predicate, and it cannot trip at all below a sample worth judging.
 */
const MAX_EVICT_FRACTION = 0.4;
/** Below this many screened in a pass, the fraction is noise — don't judge it. */
const MIN_SCREENED_FOR_BREAKER = 30;

/**
 * Re-apply the security gate to coins ALREADY tracked.
 *
 * `screenSecurity` runs on discovered pools only, so nothing ever re-checked a
 * coin once it was adopted — and until c68d5bbb the per-pass budget counted
 * cache hits, so only the first 12 of a deterministic ordering were screened at
 * all. Every coin on the list predates a working gate.
 *
 * Cheap by construction: cached lookups cost nothing and only genuine misses
 * spend the API budget, so a pass screens everything already cached and chips
 * away at the rest. With a 900s security TTL the list turns over continuously
 * rather than in one expensive sweep.
 */
async function rescreenTracked(): Promise<number> {
    if (!mobulaEnabled()) return 0;

    const rows = await db
        .select({
            id: trackedTokens.id,
            network: trackedTokens.network,
            tokenAddress: trackedTokens.tokenAddress,
        })
        .from(trackedTokens)
        .where(and(eq(trackedTokens.pinned, false), isNull(trackedTokens.wpTokenId)));
    if (rows.length === 0) return 0;

    const doomed: string[] = [];
    let apiCalls = 0;
    let screened = 0;

    for (const r of rows) {
        if (apiCalls >= SECURITY_CHECKS_PER_PASS) break;
        try {
            const sec = await withCache(
                securityCacheKey(r.network, r.tokenAddress),
                mobulaCadence().securityTtl,
                () => {
                    apiCalls++;
                    return fetchMobulaTokenSecurity(r.network, r.tokenAddress);
                },
            );
            screened++;
            if (!passesSecurityBar(sec)) doomed.push(r.id);
        } catch {
            // Fail-open, same as discovery: a 429 is not evidence of anything.
        }
    }

    if (doomed.length === 0) return 0;

    // Measured against what was SCREENED this pass, not the whole table: a pass
    // that reached 40 coins and rejected 35 is exactly as alarming as one that
    // rejected 90% of 300. But a pass that reached 5 and rejected 3 is not
    // alarming at all, which is what MIN_SCREENED_FOR_BREAKER is for.
    if (screened >= MIN_SCREENED_FOR_BREAKER && doomed.length / screened > MAX_EVICT_FRACTION) {
        console.error(
            `[coin-feed] SECURITY RE-SCREEN REFUSED: ${doomed.length}/${screened} coins failed ` +
            `(> ${Math.round(MAX_EVICT_FRACTION * 100)}%). That is a broken predicate, not a dirty ` +
            `list — nothing evicted. Run scripts/coin-feed/audit-security.ts --db prod.`,
        );
        return 0;
    }

    await db.delete(trackedTokens).where(inArray(trackedTokens.id, doomed));
    console.log(`[coin-feed] security re-screen evicted ${doomed.length}/${screened} tracked coin(s)`);
    return doomed.length;
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

/**
 * Re-apply the brand bar to coins ALREADY on the watch list.
 *
 * `clearsBrandBar` runs in `qualifies()`, which only gates ADOPTION. Nothing
 * re-checked it afterwards, and none of the other exits reach these coins: they
 * are not in EXCLUDED_SYMBOLS, their market caps are nowhere near
 * MAX_MARKET_CAP_USD, `pruneStale` needs 48h of quiet on both axes, and
 * `enforceCap` deletes by volume ASC — brand squats are among the loudest rows
 * in the table, so they are evicted last of all.
 *
 * The asymmetry is the bug. A brand-riding coin is admitted only while it holds
 * BRAND_SQUAT_MIN_LIQUIDITY_USD, and then keeps its slot no matter what happens
 * to that liquidity — including the exact case the bar exists for, where the
 * pool is pulled and the coin carries on alerting from the rail.
 *
 * Self-healing in both directions: liquidity recovers, `qualifies()` re-adopts
 * it on the next pass. Deliberately skips pinned and watchparty coins, like
 * every other eviction here.
 *
 * ⚠️ Measured 2026-08-10, this evicts **6** of the 49 ticker-squat rows on the
 * live list — the other 43 hold $250k+ and clear the bar honestly. The point is
 * not the six slots; it is that retention now uses the same rule as adoption.
 */
async function evictBrandSquats(): Promise<number> {
    const rows = await db
        .select({
            id: trackedTokens.id,
            symbol: trackedTokens.symbol,
            name: trackedTokens.name,
            liquidityUsd: trackedTokens.liquidityUsd,
        })
        .from(trackedTokens)
        .where(and(eq(trackedTokens.pinned, false), isNull(trackedTokens.wpTokenId)));

    // Filtered in JS, not SQL: clearsBrandBar is the one definition of this
    // rule and it lives in quality.ts. Re-expressing it as a WHERE clause would
    // be a second copy, and the first thing to drift.
    const doomed = rows.filter((r) => !clearsBrandBar(r.symbol, r.name, r.liquidityUsd)).map((r) => r.id);
    if (doomed.length === 0) return 0;

    await db.delete(trackedTokens).where(inArray(trackedTokens.id, doomed));
    console.log(`[coin-feed] brand bar evicted ${doomed.length} tracked coin(s)`);
    return doomed.length;
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
/**
 * ⚠️ CORRECTION 2026-08-10. An earlier version of this comment claimed this
 * policy was "the inverse of what the rail is for" — that the cap was evicting
 * small memecoins and leaving blue chips. **That was wrong**, and it was wrong
 * because it read VOLUME as a proxy for size without ever checking market cap:
 *
 *     median market cap  $1,173,897      median turnover  21.0x
 *     p25 market cap       $150,634      over $50M mcap   8 of 300
 *
 * A $1.2M coin doing $15M a day is a memecoin in a frenzy — exactly the target.
 * The list is saturated at 300/300 and `volume24hUsd ASC` keeps the most active
 * of a set of coins that are already small. That is defensible as it stands.
 *
 * MAX_TRACKED remains the latency dial (a pass scans 24 coins/min, so 300 is a
 * ~12 min worst-case cycle, and at saturation we are always at worst case).
 * Raising it buys breadth by spending freshness; a paid GeckoTerminal key buys
 * both. Left alone deliberately.
 *
 * What the saturation DOES cost is slots, and the thing consuming them turned
 * out to be brand-squat duplicates rather than the eviction order — see
 * quality.ts BRAND_WORDS.
 */
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
    const evicted = (await evictExcluded()) + (await evictBrandSquats()) + (await rescreenTracked());
    const pruned = await pruneStale();
    const trimmed = await enforceCap();

    return { discovered, watchparty, evicted, pruned, trimmed };
}
