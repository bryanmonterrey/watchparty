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
import { streamSamples } from "@/db/schema/content/stream-sample";
import { nanoid } from "nanoid";
import { eq, and, inArray, notInArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { dispatchDeveloperEvent } from "@/lib/developer/webhooks";
import { IvsClient, ListStreamsCommand } from "@aws-sdk/client-ivs";

export const dynamic = "force-dynamic";

/**
 * How long the per-minute samples live. Thirty days matches how far back the
 * studio's broadcast list goes; past that a creator is reading totals, not
 * shapes, and the aggregates carry those forever.
 */
const RETENTION_DAYS = 30;
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
    let pruned = 0;

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
            const [openSession] = await db.update(streamSessions)
                .set({
                    peakViewers: sql`GREATEST(${streamSessions.peakViewers}, ${count})`,
                    sampleCount: sql`${streamSessions.sampleCount} + 1`,
                    viewerSum: sql`${streamSessions.viewerSum} + ${count}`,
                })
                .where(and(eq(streamSessions.userId, row.userId), isNull(streamSessions.endedAt)))
                .returning({ id: streamSessions.id });

            // And keep the SHAPE, not just the summary — one point per minute,
            // pruned below. `returning` rather than a second lookup: the update
            // already found the open session, and asking again would be a
            // second round trip for a row we just touched.
            if (openSession) {
                await db.insert(streamSamples).values({
                    id: nanoid(),
                    sessionId: openSession.id,
                    viewers: count,
                });
            }

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

    // PRUNE, on the same pass that writes. A retention window enforced by the
    // only job that ever inserts cannot drift out of sync with the inserts, and
    // needs no schedule of its own. The aggregates on stream_sessions are NOT
    // touched: an old broadcast keeps its peak and average and loses only the
    // minute-by-minute shape.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    // lt(column, date), never a Date interpolated into sql`` — drizzle needs
    // the column to know it is a timestamptz, and on Workers a raw Date reaches
    // postgres.js and throws (see CLAUDE.md).
    const dropped = await db.delete(streamSamples)
        .where(lt(streamSamples.at, cutoff))
        .returning({ id: streamSamples.id });
    pruned = dropped.length;

    return NextResponse.json({ liveOnIvs: liveByArn.size, updated, healedOffline, pruned });
}
