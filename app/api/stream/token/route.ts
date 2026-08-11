import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { verifyApiKeySig, revokedKey } from "@/lib/api-gate";
import { redis } from "@/lib/cache";
import { signRealtimeToken } from "@/lib/realtime/token";
import { rooms } from "@/lib/realtime/protocol";
import { limitOrPass, socketConnectionLimiter } from "@/lib/rate-limit";

// GET /api/stream/token — mint a short-lived socket token for the developer
// event-stream PUSH room. A developer's daemon has no session cookie, so this
// is the API-key twin of /api/realtime/token: x-api-key in, 120s HS256 token
// out. The client connects to wss://<host>/parties/chat/<room>?token=… and
// re-mints on every reconnect (the 120s TTL is also the revocation bound —
// same pattern as the browser realtime client).
//
// The push room only ever carries NUDGES ("deliveries past seq N exist");
// event payloads flow through the metered pull endpoint. That's why this mint
// is free of the 402 gate's balance debit but still checks revocation.
export async function GET(req: NextRequest) {
    const key = req.headers.get("x-api-key");
    if (!key) {
        return NextResponse.json({ error: "Missing x-api-key" }, { status: 401 });
    }
    const keyId = await verifyApiKeySig(key);
    if (!keyId) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Revocation, both layers: the durable ledger row and the Redis flag the
    // 402 gate honors (revoke takes effect there before the cron reconciles).
    const [owner] = await db
        .select({ userId: apiKeys.userId, revokedAt: apiKeys.revokedAt, name: apiKeys.name })
        .from(apiKeys)
        .where(eq(apiKeys.id, keyId))
        .limit(1);
    if (!owner || owner.revokedAt) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    const revoked = await redis.get(revokedKey(keyId)).catch(() => null);
    if (revoked) {
        return NextResponse.json({ error: "API key revoked" }, { status: 401 });
    }

    // The written-for-this limiter, finally wired: 5 mints/min per key.
    if (!(await limitOrPass(socketConnectionLimiter, `dev-stream:${keyId}`))) {
        return NextResponse.json({ error: "Too many connections — wait a minute" }, { status: 429 });
    }

    const secret = process.env.REALTIME_SECRET;
    const host = process.env.REALTIME_HOST ?? process.env.NEXT_PUBLIC_REALTIME_HOST;
    if (!secret || !host) {
        return NextResponse.json({ error: "Realtime is not configured" }, { status: 503 });
    }

    const token = await signRealtimeToken(
        { sub: owner.userId, name: owner.name ?? "api", chat: false },
        secret,
    );
    return NextResponse.json({
        token,
        room: rooms.devStream(owner.userId),
        host,
        expiresIn: 120,
    });
}
