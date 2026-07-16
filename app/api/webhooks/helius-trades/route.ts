// Helius webhook receiver for token trades (registration:
// lib/tokens/trades-webhook.ts). A watched POOL address appeared in a
// transaction → someone traded that token (on Jupiter, Photon, anywhere) →
// re-sync its cached market row immediately. The UPDATE on `tokens` rides the
// existing Supabase realtime channel to every open trade surface, so external
// activity lands in seconds — the minute cron is only the self-heal behind
// this.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { withCache } from "@/lib/cache";
import { syncMarketData, syncCurveProgress, type SyncableToken } from "@/lib/tokens/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HeliusEvent = {
    signature?: string;
    accountData?: { account?: string }[];
};

// A hot token can appear in many txs per second; sync it at most once per
// window and let the rest ride the resulting realtime push.
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

    // Cap the candidate list — a pathological batch shouldn't build a huge
    // IN clause. Watched pools are a tiny fraction of accounts in any tx.
    const candidates = [...touched].slice(0, 2000);

    const rows = await db
        .select({ id: tokens.id, poolAddress: tokens.poolAddress, phase: tokens.phase })
        .from(tokens)
        .where(and(
            eq(tokens.status, "live"),
            isNotNull(tokens.poolAddress),
            inArray(tokens.poolAddress, candidates),
        ))
        .limit(MAX_TOKENS_PER_CALL);
    if (rows.length === 0) return NextResponse.json({ ok: true, synced: 0 });

    // Per-token claim throttle (same identity trick as trade.syncToken).
    const toSync: SyncableToken[] = [];
    for (const row of rows) {
        const claim = `${Date.now()}:${Math.random()}`;
        const winner = await withCache(`token:sync-req:${row.id}`, THROTTLE_SECONDS, async () => claim);
        if (winner === claim) toSync.push({ id: row.id, poolAddress: row.poolAddress!, phase: row.phase });
    }
    if (toSync.length === 0) return NextResponse.json({ ok: true, synced: 0, throttled: rows.length });

    const synced = await syncMarketData(toSync);
    await syncCurveProgress(toSync);

    return NextResponse.json({ ok: true, synced });
}
