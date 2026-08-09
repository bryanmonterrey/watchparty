// Helius webhook receiver for token trades (registration:
// lib/tokens/trades-webhook.ts). A watched POOL address appeared in a
// transaction → someone traded that token (on Jupiter, Photon, anywhere) →
// re-sync its cached market row immediately. The UPDATE on `tokens` rides the
// existing Supabase realtime channel to every open trade surface, so external
// activity lands in seconds — the minute cron is only the self-heal behind
// this.
import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, eq, isNotNull } from "drizzle-orm";
import { withCache, redis } from "@/lib/cache";
import { syncMarketData, syncCurveProgress, type SyncableToken } from "@/lib/tokens/market-sync";
import { recordSwaps, type HeliusSwapEvent } from "@/lib/coins/record-swaps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only the fields this route reads directly; the swap payload is typed by
// HeliusSwapEvent, which recordSwaps consumes.
type HeliusEvent = {
    signature?: string;
    accountData?: { account?: string }[];
};

// A hot token can appear in many txs per second; sync it at most once per
// window and let the rest ride the resulting realtime push.
// A failed read here used to become an endless one. `withCache` stores nothing
// when the query throws, so the next delivery ran it again immediately — and
// this endpoint takes tens per second. The database was being hammered BECAUSE
// it was failing, which is how one bad moment turned into 100 errors per 10
// minutes and took unrelated page renders down with it.
//
// So the first failure buys quiet: skip the read (and the delivery) for a few
// seconds instead of re-asking. Short on purpose — recovery shouldn't need a
// deploy, and a dropped delivery costs a few seconds of tape, not correctness.
const DB_BREAKER_KEY = "helius-trades:db-out";
const DB_BREAKER_SECONDS = 15;

async function readOrSkip<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T | null> {
    try {
        if (await redis.get(DB_BREAKER_KEY)) return null;
    } catch {
        // Redis unreachable — that's no reason to skip the read.
    }

    try {
        return await withCache(key, ttl, fn);
    } catch (err) {
        console.error(`[helius-trades] ${key} failed:`, err instanceof Error ? err.message : err);
        try {
            await redis.set(DB_BREAKER_KEY, Date.now(), { ex: DB_BREAKER_SECONDS });
        } catch {
            // Without Redis there's no breaker; the read simply retries next time.
        }
        return null;
    }
}

const THROTTLE_SECONDS = 5;
const MAX_TOKENS_PER_CALL = 10;

export async function POST(req: NextRequest) {
    if (process.env.HELIUS_WEBHOOK_SECRET) {
        const auth = req.headers.get("authorization");
        if (auth !== process.env.HELIUS_WEBHOOK_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    let events: HeliusEvent[] = [];
    try {
        const json = await req.json();
        events = Array.isArray(json) ? json : [];
    } catch {
        return NextResponse.json({ ok: true });
    }

    // Every account touched by the batch → which are pools we track?
    const touched = new Set<string>();
    for (const ev of events) {
        for (const a of ev.accountData ?? []) {
            if (a.account) touched.add(a.account);
        }
    }
    if (touched.size === 0) return NextResponse.json({ ok: true, synced: 0 });

    // CACHED, then filtered in memory — the same treatment displayPools got,
    // and for the same reason. Capping registration at 15 pools was not enough
    // on its own: this query still ran on EVERY delivery, and 15 trending pools
    // deliver fast enough to exhaust the 15-connection pool by themselves. When
    // it does, unrelated server renders fail too — a coin page reads the
    // database during render, so users saw "An error occurred in the Server
    // Components render" that had nothing to do with the coin page.
    //
    // Live tokens are the ones WE launched, so this list is small and changes
    // only when one launches. Caching it for 60s makes the hot path do no reads
    // at all; the only database work left per delivery is the tape insert.
    const liveTokens = await readOrSkip("helius-trades:live-tokens", 60, async () =>
        db
            .select({
                id: tokens.id,
                poolAddress: tokens.poolAddress,
                phase: tokens.phase,
                tokenAddress: tokens.tokenAddress,
                name: tokens.name,
                ticker: tokens.ticker,
                lastAlertPriceUsd: tokens.lastAlertPriceUsd,
                lastAlertAt: tokens.lastAlertAt,
            })
            .from(tokens)
            .where(and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress))),
    );
    // Breaker up (or the read just failed): acknowledge and move on. Helius
    // takes a 200 as delivered and won't redeliver, which is the point — a
    // retry storm on a database that's already struggling is what we're
    // getting away from.
    if (!liveTokens) return NextResponse.json({ ok: true, skipped: "db" });

    const rows = liveTokens
        .filter((t) => t.poolAddress && touched.has(t.poolAddress))
        .slice(0, MAX_TOKENS_PER_CALL);

    // Pools we only DISPLAY (trending) are registered on the same webhook but
    // have no `tokens` row, so they'd arrive and be dropped. They get a tape but
    // no market-row sync — syncMarketData is for tokens we own the pricing
    // model for.
    //
    // CACHED, not queried per delivery. This endpoint runs at tens of requests
    // per SECOND on an active board, and a per-delivery query here exhausted the
    // 15-connection pool and took out unrelated pages. The trending board only
    // changes on its own sync, so a 60s cache is free accuracy-wise and turns
    // the hot path into zero database reads.
    const displayPools = await readOrSkip("helius-trades:display-pools", 60, async () =>
        db
            .select({ poolAddress: trendingCoins.poolAddress, tokenAddress: trendingCoins.tokenAddress })
            .from(trendingCoins)
            .where(eq(trendingCoins.network, "solana"))
            .orderBy(trendingCoins.rank)
            .limit(50),
    );
    // A missing trending list only costs display-pool tape, so this one degrades
    // rather than skipping: tokens we own the pricing model for still sync.
    const displayHits = (displayPools ?? []).filter((p) => p.poolAddress && touched.has(p.poolAddress));

    if (rows.length === 0 && displayHits.length === 0) {
        return NextResponse.json({ ok: true, synced: 0 });
    }

    // RECORD THE TAPE — deliberately before, and outside, the throttle below.
    // That throttle exists to avoid re-syncing a hot token's price row more
    // than once every few seconds; individual swaps are the opposite case, and
    // dropping them is exactly what left the transactions table with nothing to
    // show but a 30s poll of a rate-limited upstream. Every swap gets written.
    let recorded = 0;
    try {
        const poolsByAddress = new Map<string, { network: string; tokenAddress: string }>();
        for (const r of rows) {
            if (r.poolAddress && r.tokenAddress) {
                poolsByAddress.set(r.poolAddress, { network: "solana", tokenAddress: r.tokenAddress });
            }
        }
        for (const p of displayHits) {
            if (p.poolAddress && p.tokenAddress && !poolsByAddress.has(p.poolAddress)) {
                poolsByAddress.set(p.poolAddress, { network: "solana", tokenAddress: p.tokenAddress });
            }
        }
        recorded = await recordSwaps(events as HeliusSwapEvent[], poolsByAddress);
    } catch (err) {
        // The tape is additive. If it fails, the price sync below must still
        // run — that's the path that keeps headline numbers correct.
        console.error("[helius-trades] recordSwaps failed:", err instanceof Error ? err.message : err);
    }

    // ACKNOWLEDGE FIRST, SYNC AFTER.
    //
    // Everything below is price work: a per-row Redis claim, then syncMarketData
    // and syncCurveProgress, both of which call external pricing APIs. Doing it
    // before responding put third-party latency on Helius's clock, and Helius
    // hangs up when a delivery is slow — 83,777 of those (status 499) in nine
    // hours, plus 37,536 500s from throws in exactly this tail, which was
    // outside every try/catch. 30.4% of deliveries failed.
    //
    // A failed delivery is REDELIVERED, so the failures were also generating
    // their own load: ~738 req/min against a webhook product that bills per
    // call, and the reason Helius burn projects ~7.5M credits against a 1M plan.
    //
    // `after()` runs once the response is sent, so Helius sees a fast 200 and
    // stops retrying, and the sync still happens. Errors in here can no longer
    // become a delivery failure — they're logged.
    after(async () => {
        try {
            // Per-token claim throttle (same identity trick as trade.syncToken).
            const toSync: SyncableToken[] = [];
            for (const row of rows) {
                const claim = `${Date.now()}:${Math.random()}`;
                const winner = await withCache(`token:sync-req:${row.id}`, THROTTLE_SECONDS, async () => claim);
                if (winner === claim) toSync.push({ ...row, poolAddress: row.poolAddress! });
            }
            if (toSync.length === 0) return;

            await syncMarketData(toSync);
            await syncCurveProgress(toSync);
        } catch (err) {
            console.error("[helius-trades] post-ack sync failed:", err instanceof Error ? err.message : err);
        }
    });

    return NextResponse.json({ ok: true, recorded, queued: rows.length });
}
