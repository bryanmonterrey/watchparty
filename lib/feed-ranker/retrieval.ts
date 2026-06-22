import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getUserVector } from "./server";
import { getUserHistory } from "./history";
import { FEED_RANKER_ENABLED } from "./config";

// Out-of-network candidate retrieval: embed the user (retrieval user tower),
// then ANN-search the post_embeddings corpus (pgvector cosine) for content
// similar to what they engage with — surfacing posts/streams beyond their
// follows/recency window. This is the "tweet-mixer" half of X's 50/50 in/out
// network split. Returns candidate ids (ranking happens downstream in /rank).

export interface RetrievedCandidate {
    id: string;
    userId: string;            // author
    subjectType: "post" | "stream";
    ticker: string | null;
    tokenStatus: string | null;
}

export async function retrieveOutOfNetwork(
    userId: string,
    limit = 100,
): Promise<RetrievedCandidate[]> {
    if (!FEED_RANKER_ENABLED) return [];

    const history = await getUserHistory(userId);
    if (history.length === 0) return []; // cold-start: nothing to match on yet

    const vec = await getUserVector(userId, history);
    if (!vec) return [];

    const literal = `[${vec.join(",")}]`;
    // Join back to posts/streams for the fields the ranker + crypto boost need.
    // Cosine distance (<=>) ascending = most similar first.
    const rows = await db.execute<RetrievedCandidate>(sql`
        SELECT e."subjectId" AS id,
               e."authorId" AS "userId",
               e."subjectType",
               p.ticker,
               p."tokenStatus"
        FROM post_embeddings e
        LEFT JOIN posts p ON p.id = e."subjectId" AND e."subjectType" = 'post'
        WHERE (e."subjectType" = 'post'
                 AND p.status = 'published' AND p.visibility = 'public')
           OR e."subjectType" = 'stream'
        ORDER BY e.embedding <=> ${literal}::vector
        LIMIT ${limit}
    `);
    return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        subjectType: r.subjectType,
        ticker: r.ticker ?? null,
        tokenStatus: r.tokenStatus ?? null,
    }));
}
