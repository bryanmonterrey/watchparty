import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { embedItems } from "@/lib/feed-ranker/server";
import { FEED_RANKER_ENABLED } from "@/lib/feed-ranker/config";

// Builds the Phoenix retrieval corpus: embeds recent posts + live streams via
// the item tower (/embed) and upserts the 128-d vectors into post_embeddings
// (pgvector). Feed retrieval ANN-searches this for out-of-network candidates
// (discovery beyond a user's follows / recency window).
//
// Posts are embedded once (re-embedded only if missing/stale); live streams are
// refreshed every run since their candidacy is gated on isLive. Scheduled via
// Cloudflare cron (see the deploy runbook).

export const maxDuration = 300;

const POST_BATCH = 256;   // recent posts to (re)embed per run
const EMBED_CHUNK = 128;  // items per /embed call

export async function GET(req: NextRequest) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!FEED_RANKER_ENABLED) {
        return NextResponse.json({ skipped: "ranker disabled" });
    }

    // Recent public posts not yet embedded (or stale), + all live streams.
    const postRows = await db.execute<{ id: string; userId: string }>(sql`
        SELECT p.id, p."userId"
        FROM posts p
        LEFT JOIN post_embeddings e ON e."subjectId" = p.id AND e."subjectType" = 'post'
        WHERE p.status = 'published' AND p.visibility = 'public'
          AND (e."subjectId" IS NULL OR e."updatedAt" < p."createdAt")
        ORDER BY p."createdAt" DESC
        LIMIT ${POST_BATCH}
    `);
    const streamRows = await db.execute<{ id: string; userId: string }>(sql`
        SELECT id, "userId" FROM streams WHERE "isLive" = true
    `);

    const items = [
        ...postRows.map((r) => ({ subjectId: r.id, subjectType: "post" as const, authorId: r.userId, surface: "home" })),
        ...streamRows.map((r) => ({ subjectId: r.id, subjectType: "stream" as const, authorId: r.userId, surface: "stream" })),
    ];

    let upserted = 0;
    for (let i = 0; i < items.length; i += EMBED_CHUNK) {
        const chunk = items.slice(i, i + EMBED_CHUNK);
        const embs = await embedItems(chunk);
        if (!embs) continue; // service unavailable → skip this chunk, retry next run

        const byRef = new Map(chunk.map((c) => [c.subjectId, c]));
        for (const e of embs) {
            const meta = byRef.get(e.ref);
            if (!meta) continue;
            const vec = `[${e.vector.join(",")}]`;
            await db.execute(sql`
                INSERT INTO post_embeddings ("subjectId", "subjectType", "authorId", embedding, "updatedAt")
                VALUES (${meta.subjectId}, ${meta.subjectType}, ${meta.authorId}, ${vec}::vector, now())
                ON CONFLICT ("subjectId", "subjectType")
                DO UPDATE SET embedding = EXCLUDED.embedding, "authorId" = EXCLUDED."authorId", "updatedAt" = now()
            `);
            upserted++;
        }
    }

    return NextResponse.json({ posts: postRows.length, streams: streamRows.length, upserted });
}
