import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { developerStreamDeliveries } from "@/db/schema/content/developer-stream-delivery";
import { verifyApiKeySig, revokedKey } from "@/lib/api-gate";
import { redis } from "@/lib/cache";

// GET /api/stream/events?since=<seq>&limit=<n>
//
// Cursor-pull for a developer's filtered event stream. Events matched by an
// app's stream rules (lib/developer/stream-rules.ts) queue in
// developer_stream_deliveries; this endpoint hands them back in seq order and
// the caller advances `since` to the returned `cursor`. Semantics: at-least-
// once, replayable within the retention window, no long-lived connection.
//
// Auth is the app's API key in `x-api-key` (the SAME header the 402 gate reads,
// so a request that clears the gate authenticates here too — the gate meters
// the call in middleware before this handler runs). An app-scoped key returns
// that app's stream; an account-level key returns the union across the caller's
// apps. Bots consume their identity/community surface over tRPC, not this REST
// stream, so bot tokens are intentionally not accepted here.

const RETENTION_DAYS = 3;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function num(v: string | null, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
    const key = req.headers.get("x-api-key");
    if (!key) {
        return NextResponse.json({ error: "Missing x-api-key" }, { status: 401 });
    }
    const keyId = await verifyApiKeySig(key);
    if (!keyId) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    const [owner] = await db
        .select({ userId: apiKeys.userId, appId: apiKeys.appId, revokedAt: apiKeys.revokedAt })
        .from(apiKeys)
        .where(eq(apiKeys.id, keyId))
        .limit(1);
    // revokedAt was previously unchecked here — a revoked key kept reading the
    // stream for as long as its HMAC stayed valid (forever). The Redis flag is
    // checked too so console revocation bites before the ledger cron runs.
    if (!owner || owner.revokedAt) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    const revoked = await redis.get(revokedKey(keyId)).catch(() => null);
    if (revoked) {
        return NextResponse.json({ error: "API key revoked" }, { status: 401 });
    }

    const since = Math.max(0, Math.floor(num(req.nextUrl.searchParams.get("since"), 0)));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(num(req.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT))));

    // App-scoped key → that app; account-level key → all the caller's apps.
    const scope = owner.appId
        ? eq(developerStreamDeliveries.appId, owner.appId)
        : eq(developerStreamDeliveries.userId, owner.userId);

    const rows = await db
        .select({
            seq: developerStreamDeliveries.seq,
            type: developerStreamDeliveries.eventType,
            tag: developerStreamDeliveries.tag,
            payload: developerStreamDeliveries.payload,
            createdAt: developerStreamDeliveries.createdAt,
        })
        .from(developerStreamDeliveries)
        .where(and(scope, gt(developerStreamDeliveries.seq, since)))
        .orderBy(asc(developerStreamDeliveries.seq))
        .limit(limit);

    // Opportunistic retention prune of this caller's stale rows. `lt(column,
    // Date)` maps through the timestamptz encoder — safe, unlike interpolating a
    // Date into a raw sql`` template (the prod-only workerd bug).
    try {
        await db
            .delete(developerStreamDeliveries)
            .where(and(scope, lt(developerStreamDeliveries.createdAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000))));
    } catch (err) {
        console.error("stream delivery prune failed:", err);
    }

    const cursor = rows.length ? rows[rows.length - 1].seq : since;
    return NextResponse.json({ events: rows, cursor });
}
