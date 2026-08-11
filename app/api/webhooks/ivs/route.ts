import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { eq } from "drizzle-orm";
import { dispatchDeveloperEvent } from "@/lib/developer/webhooks";
import { openStreamSession, closeStreamSession } from "@/lib/stream/sessions";
import { timingSafeEqual } from "crypto";

// IVS → EventBridge rule → API destination posts here; this is what flips
// `isLive` — without it, going live in OBS never shows up in the app.
//
// Real IVS events are always detail-type "IVS Stream State Change" with the
// name in detail.event_name ("Stream Start" | "Stream End" | "Stream Failure").
// The channel ARN arrives in the top-level `resources` array, not in detail.
// EventBridge carries no viewer counts; those come from polling GetStream.
//
// EventBridge API destinations can only attach a static header, so the shared
// secret is compared directly (not an HMAC of the body).
function verifySecret(header: string | null, secret: string): boolean {
    if (!secret) return true; // skip if not configured
    if (!header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
    const secret = process.env.IVS_WEBHOOK_SECRET ?? "";
    const rawBody = await req.text();

    if (!verifySecret(req.headers.get("x-ivs-signature"), secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: {
        "detail-type"?: string;
        resources?: string[];
        detail?: { event_name?: string; channel_arn?: string; stream_id?: string };
    };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const channelArn = event.resources?.[0] ?? event.detail?.channel_arn;
    if (event["detail-type"] !== "IVS Stream State Change" || !channelArn) {
        return NextResponse.json({ ok: true }); // unrelated event type
    }

    const eventName = event.detail?.event_name;
    // IVS state changes are edge-triggered but can re-fire (EventBridge is
    // at-least-once) — webhook consumers dedupe on sessionId.
    const sessionId = event.detail?.stream_id ?? null;
    if (eventName === "Stream Start") {
        const rows = await db.update(streams)
            .set({ isLive: true, viewerCount: 0, updatedAt: new Date() })
            .where(eq(streams.channelArn, channelArn))
            .returning({ id: streams.id, userId: streams.userId, title: streams.title, category: streams.category });
        for (const row of rows) {
            await openStreamSession(row.userId, row.title, row.category);
            await dispatchDeveloperEvent(row.userId, "stream.online", { streamId: row.id, sessionId });
        }
    } else if (eventName === "Stream End" || eventName === "Stream Failure") {
        const rows = await db.update(streams)
            .set({ isLive: false, viewerCount: 0, updatedAt: new Date() })
            .where(eq(streams.channelArn, channelArn))
            .returning({ id: streams.id, userId: streams.userId });
        for (const row of rows) {
            await closeStreamSession(row.userId);
            await dispatchDeveloperEvent(row.userId, "stream.offline", { streamId: row.id, sessionId });
        }
    }

    return NextResponse.json({ ok: true });
}
