// Viewer-count + live-state reconciler for IVS streams.
//
// EventBridge webhooks flip isLive on Stream Start/End, but carry NO viewer
// counts — and a missed webhook leaves a stream stuck live forever. This cron
// is the source of truth in between: one ListStreams call returns every
// currently-live stream on the account with its viewerCount, and we reconcile
// the DB against it:
//   - live in IVS → upsert isLive + viewerCount (also heals a missed Start)
//   - marked live in DB but absent from IVS → flip offline (heals a missed End)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { streamSessions } from "@/db/schema/content/stream-session";
import { eq, and, inArray, notInArray, isNotNull, isNull, sql } from "drizzle-orm";
import { dispatchDeveloperEvent } from "@/lib/developer/webhooks";
import { IvsClient, ListStreamsCommand } from "@aws-sdk/client-ivs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ivs = new IvsClient({
        region: process.env.AWS_REGION ?? "us-east-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });

    // channelArn → viewerCount for every stream IVS says is live right now
    const liveByArn = new Map<string, number>();
    let nextToken: string | undefined;
    do {
        const page = await ivs.send(new ListStreamsCommand({ maxResults: 100, nextToken }));
        for (const s of page.streams ?? []) {
            if (s.channelArn) liveByArn.set(s.channelArn, s.viewerCount ?? 0);
        }
        nextToken = page.nextToken;
    } while (nextToken);

    let updated = 0;
    let healedOffline = 0;

    if (liveByArn.size > 0) {
        const arns = [...liveByArn.keys()];
        const rows = await db
            .select({ id: streams.id, userId: streams.userId, channelArn: streams.channelArn, isLive: streams.isLive, viewerCount: streams.viewerCount })
            .from(streams)
            .where(inArray(streams.channelArn, arns));
        for (const row of rows) {
            const count = liveByArn.get(row.channelArn!) ?? 0;

            // FOLD THE SAMPLE into this user's open broadcast, every pass —
            // unconditionally, unlike the update below, which only fires on
            // change. An audience that sits at exactly 412 for ten minutes is
            // ten samples, not one, and skipping the unchanged ones would drag
            // the average toward whatever number moved most.
            //
            // This runs every minute and already holds the count, which is why
            // per-stream CCV needed no cron of its own. Straight to SQL so
            // peak/sum/count move in ONE statement — read-modify-write across
            // two round trips would lose samples whenever a pass overlapped.
            await db.update(streamSessions)
                .set({
                    peakViewers: sql`GREATEST(${streamSessions.peakViewers}, ${count})`,
                    sampleCount: sql`${streamSessions.sampleCount} + 1`,
                    viewerSum: sql`${streamSessions.viewerSum} + ${count}`,
                })
                .where(and(eq(streamSessions.userId, row.userId), isNull(streamSessions.endedAt)));

            if (!row.isLive || row.viewerCount !== count) {
                await db.update(streams)
                    .set({ isLive: true, viewerCount: count, updatedAt: new Date() })
                    .where(eq(streams.id, row.id));
                updated++;
                // A healed missed Stream Start is a real transition — the
                // viewer-count-only refresh (isLive already true) is not.
                if (!row.isLive) {
                    await dispatchDeveloperEvent(row.userId, "stream.online", { streamId: row.id, sessionId: null });
                }
            }
        }
    }

    // DB thinks live, IVS doesn't → offline (covers missed Stream End webhooks)
    const stale = await db
        .select({ id: streams.id, userId: streams.userId })
        .from(streams)
        .where(and(
            eq(streams.isLive, true),
            isNotNull(streams.channelArn),
            liveByArn.size > 0 ? notInArray(streams.channelArn, [...liveByArn.keys()]) : undefined,
        ));
    if (stale.length > 0) {
        await db.update(streams)
            .set({ isLive: false, viewerCount: 0, updatedAt: new Date() })
            .where(inArray(streams.id, stale.map((s) => s.id)));
        healedOffline = stale.length;
        for (const row of stale) {
            await dispatchDeveloperEvent(row.userId, "stream.offline", { streamId: row.id, sessionId: null });
        }
    }

    return NextResponse.json({ liveOnIvs: liveByArn.size, updated, healedOffline });
}
