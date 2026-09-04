// Helius webhook receiver for token trades (registration:
// lib/tokens/trades-webhook.ts). A watched POOL address appeared in a
// transaction → someone traded that token (on Jupiter, Photon, anywhere) →
// re-sync its cached market row immediately. The UPDATE on `tokens` rides the
// existing Supabase realtime channel to every open trade surface, so external
// activity lands in seconds — the minute cron is only the self-heal behind
// this.
import { NextRequest, NextResponse, after } from "next/server";
import { isAuthorizedHeliusRequest } from "@/lib/helius/webhook-secret";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, eq, isNotNull } from "drizzle-orm";
import { withCache, redis } from "@/lib/cache";
import { syncMarketData, syncCurveProgress, type SyncableToken } from "@/lib/tokens/market-sync";
import { recordSwaps, type HeliusSwapEvent } from "@/lib/coins/record-swaps";
import { BREAKER_PER_MIN, countDelivery, shedIfBursting } from "@/lib/tokens/trades-breaker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only the fields this route reads directly; the swap payload is typed by
// HeliusSwapEvent, which recordSwaps consumes.
type HeliusEvent = {
    signature?: string;
    accountData?: { account?: string; tokenBalanceChanges?: { mint?: string }[] }[];
    tokenTransfers?: { mint?: string }[];
    events?: { swap?: { tokenInputs?: { mint?: string }[]; tokenOutputs?: { mint?: string }[] } };
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
    // Only the CURRENT secret — see lib/helius/webhook-secret.ts for why a
    // stale one must be a 401 and not a fallback.
    if (!isAuthorizedHeliusRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let events: HeliusEvent[] = [];
    try {
        const json = await req.json();
        events = Array.isArray(json) ? json : [];
    } catch {
        return NextResponse.json({ ok: true });
    }
    if (!events.length) return NextResponse.json({ ok: true, synced: 0 });

    // ACKNOWLEDGE FIRST — NOTHING BILLABLE HAPPENS ON HELIUS'S CLOCK.
    //
    // The previous shape moved only the price sync behind `after()` and still
    // did two Redis reads and the tape INSERT before responding. That was
    // enough: 304,356 deliveries (20.6% of 1.48M over 12h) still hung up as
    // 499, and Helius redelivers a failure — so the timeouts were generating
    // their own billable load on a product that charges per call.
    //
    // Reading the body is the only thing that must happen before the response,
    // because the request stream doesn't outlive it. Everything after this line
    // runs in `after()`, where a slow database or a slow pricing API can cost a
    // log line and nothing else.
    after(() => processDelivery(events));

    return NextResponse.json({ ok: true });
}

async function processDelivery(events: HeliusEvent[]) {
    // Every account touched by the batch → which are pools we track?
    // Every account touched by the batch, AND every mint moved in it. The
    // webhook watches MINTS under SWAP mode (see trades-webhook.ts), and a
    // swap's mint is not reliably in `accountData[].account` — it lives in
    // the token transfers and balance changes. Matching on accounts alone
    // left the breaker's per-address counters at zero while ~200/min arrived
    // (2026-09-04), so it could see the flood but never name an address.
    const touched = new Set<string>();
    for (const ev of events) {
        for (const a of ev.accountData ?? []) {
            if (a.account) touched.add(a.account);
            for (const c of a.tokenBalanceChanges ?? []) if (c.mint) touched.add(c.mint);
        }
        for (const t of ev.tokenTransfers ?? []) if (t.mint) touched.add(t.mint);
        for (const l of ev.events?.swap?.tokenInputs ?? []) if (l.mint) touched.add(l.mint);
        for (const l of ev.events?.swap?.tokenOutputs ?? []) if (l.mint) touched.add(l.mint);
    }
    if (touched.size === 0) return;

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
    if (!liveTokens) return;

    const rows = liveTokens
        .filter((t) => t.poolAddress && touched.has(t.poolAddress))
        .slice(0, MAX_TOKENS_PER_CALL);

    // Pools we only DISPLAY (trending) are registered on the same webhook but
    // have no `tokens` row, so they'd arrive and be dropped. They get a tape but
    // no market-row sync — syncMarketData is for tokens we own the pricing
    // model for.
    //
    // NOT rank-limited any more, and that matters. Registration picks pools by
    // BUDGET now (cheapest first — lib/tokens/pool-budget.ts), while this lookup
    // used `ORDER BY rank LIMIT 50`. Two different selections over the same
    // table: a budget-picked pool outside the rank-50 window would have its
    // deliveries ACCEPTED and then silently dropped, so we would pay Helius for
    // a tape we never wrote. It only worked because solana has ~45 rows.
    //
    // The whole board is 200-odd rows across all networks and this is cached for
    // 60s, so dropping the limit costs nothing and removes the coupling.
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
            .where(eq(trendingCoins.network, "solana")),
    );
    // A missing trending list only costs display-pool tape, so this one degrades
    // rather than skipping: tokens we own the pricing model for still sync.
    // MATCH EITHER ADDRESS, and that is not belt-and-braces — it is what makes
    // the pool→mint switch in `trades-webhook.ts` safe to deploy.
    //
    // Registration now watches the MINT under SWAP mode, but the webhook is only
    // re-registered when the hourly cron runs. Between this code going live and
    // that run, Helius is still delivering on POOL addresses. A receiver that
    // matched only the new unit would drop every delivery in that window while
    // still returning 200 — paid for, acknowledged, discarded.
    //
    // It also keeps working under ANY, where `watch` stays "pool".
    const displayHits = (displayPools ?? []).filter(
        (p) =>
            (p.poolAddress && touched.has(p.poolAddress)) ||
            (p.tokenAddress && touched.has(p.tokenAddress)),
    );

    // BREAKER — the real delivery rate is only measurable here. Registration
    // picks display coins from a daily mean, and on 2026-09-04 one of them
    // (TROLL, estimated ~10/min) delivered ~1,400/min, which alone pushed the
    // container past its 4,096-connection ceiling and 500'd every page.
    // Count this delivery against the watched addresses it touched; past the
    // threshold, shed the loudest one and deny it so the sync can't re-add it.
    try {
        const watched = [
            ...liveTokens.map((t) => t.poolAddress),
            ...(displayPools ?? []).flatMap((p) => [p.poolAddress, p.tokenAddress]),
        ].filter(Boolean) as string[];
        const hits = watched.filter((a) => touched.has(a));
        const total = await countDelivery(hits);
        if (BREAKER_PER_MIN > 0 && total >= BREAKER_PER_MIN) {
            const base = (process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_AUTH_URL ?? "").replace(/\/$/, "");
            await shedIfBursting(watched, `${base}/api/webhooks/helius-trades`);
        }
    } catch (err) {
        console.error("[helius-trades] breaker failed:", err instanceof Error ? err.message : err);
    }

    if (rows.length === 0 && displayHits.length === 0) {
        return;
    }

    // RECORD THE TAPE — deliberately before, and outside, the throttle below.
    // That throttle exists to avoid re-syncing a hot token's price row more
    // than once every few seconds; individual swaps are the opposite case, and
    // dropping them is exactly what left the transactions table with nothing to
    // show but a 30s poll of a rate-limited upstream. Every swap gets written.
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
        await recordSwaps(events as HeliusSwapEvent[], poolsByAddress);
    } catch (err) {
        // The tape is additive. If it fails, the price sync below must still
        // run — that's the path that keeps headline numbers correct.
        console.error("[helius-trades] recordSwaps failed:", err instanceof Error ? err.message : err);
    }

    // Price work: a per-row Redis claim, then syncMarketData and
    // syncCurveProgress, both of which call external pricing APIs.
    //
    // This used to be wrapped in its own `after()`. It isn't any more, because
    // the whole function already runs inside one — `after()` registers work
    // against the *request*, and calling it once the response is sent is at best
    // a no-op. Plain awaits here, inside the same background task.
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
}
