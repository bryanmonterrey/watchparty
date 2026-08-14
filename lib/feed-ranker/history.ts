import "server-only";
import { db } from "@/db";
import { feedSignals } from "@/db/schema/content";
import { eq, desc } from "drizzle-orm";
import { withCache } from "@/lib/cache";
import { HISTORY_LENGTH } from "./config";
import type { HistoryItem } from "./server";

// Assembles a user's recent engagement into the Phoenix history sequence: the
// most-recent N signals collapsed per (subject) into {postId, authorId, actions}.
// One post the user both liked and dwelled on becomes a single history item with
// two action entries — which is what the model expects.

export async function getUserHistory(userId: string): Promise<HistoryItem[]> {
    // Runs twice per ranked first page (once inside retrieveOutOfNetwork, once
    // inside rankFeedRows) and again across the video/shorts ranked paths —
    // cache briefly. 60s of staleness matches the 45s rank cache in rank-feed.ts.
    return withCache(`feedhist:${userId}`, 60, () => queryUserHistory(userId));
}

async function queryUserHistory(userId: string): Promise<HistoryItem[]> {
    // Pull a generous window of recent signals; collapse to <= HISTORY_LENGTH posts.
    const rows = await db
        .select({
            subjectId: feedSignals.subjectId,
            authorId: feedSignals.authorId,
            actionType: feedSignals.actionType,
            value: feedSignals.value,
        })
        .from(feedSignals)
        .where(eq(feedSignals.userId, userId))
        .orderBy(desc(feedSignals.createdAt))
        .limit(HISTORY_LENGTH * 4);

    const byPost = new Map<string, HistoryItem>();
    for (const r of rows) {
        let item = byPost.get(r.subjectId);
        if (!item) {
            if (byPost.size >= HISTORY_LENGTH) continue; // most-recent N posts only
            item = { postId: r.subjectId, authorId: r.authorId, actions: {} };
            byPost.set(r.subjectId, item);
        }
        // Legacy negative-feedback rows were logged as 20 (out of the model's
        // 19-slot vocabulary, so the service zeroed them); remap to 17
        // (CLIENT_TWEET_NOT_INTERESTED_IN), where ACTION.NEGATIVE now writes.
        const actionType = r.actionType === 20 ? 17 : r.actionType;
        // Keep the strongest value seen for an action on this post.
        item.actions[actionType] = Math.max(item.actions[actionType] ?? 0, r.value);
    }
    return [...byPost.values()];
}
