import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

// Port of sidebar's IVS webhook. AWS EventBridge (Stream Start / Stream End /
// State Change) posts here; this is what flips `isLive` and viewer counts —
// without it, going live in OBS never shows up in the app.

// AWS EventBridge Pipes / SNS sends a signature header we can optionally verify
function verifySignature(body: string, signature: string | null, secret: string): boolean {
    if (!secret || !signature) return true; // skip if not configured
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    return signature === expected;
}

export async function POST(req: NextRequest) {
    const secret = process.env.IVS_WEBHOOK_SECRET ?? "";
    const rawBody = await req.text();
    const sig = req.headers.get("x-ivs-signature");

    if (secret && !verifySignature(rawBody, sig, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let event: { "detail-type"?: string; detail?: { channel_arn?: string; stream_id?: string; viewer_count?: number } };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const detailType = event["detail-type"];
    const channelArn = event.detail?.channel_arn;

    if (!channelArn) {
        return NextResponse.json({ ok: true }); // SNS subscription confirmation or unknown event
    }

    if (detailType === "IVS Stream Start") {
        await db.update(streams)
            .set({ isLive: true, viewerCount: 0, updatedAt: new Date() })
            .where(eq(streams.channelArn, channelArn));
    } else if (detailType === "IVS Stream End") {
        await db.update(streams)
            .set({ isLive: false, viewerCount: 0, updatedAt: new Date() })
            .where(eq(streams.channelArn, channelArn));
    } else if (detailType === "IVS Stream State Change" && typeof event.detail?.viewer_count === "number") {
        await db.update(streams)
            .set({ viewerCount: event.detail.viewer_count, updatedAt: new Date() })
            .where(eq(streams.channelArn, channelArn));
    }

    return NextResponse.json({ ok: true });
}
