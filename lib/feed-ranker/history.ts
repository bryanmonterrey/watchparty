import "server-only";
import { db } from "@/db";
import { feedSignals } from "@/db/schema/content";
import { eq, desc } from "drizzle-orm";
import { HISTORY_LENGTH } from "./config";
import type { HistoryItem } from "./server";

// Assembles a user's recent engagement into the Phoenix history sequence: the
// most-recent N signals collapsed per (subject) into {postId, authorId, actions}.
// One post the user both liked and dwelled on becomes a single history item with
// two action entries — which is what the model expects.

export async function getUserHistory(userId: string): Promise<HistoryItem[]> {
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
        // Keep the strongest value seen for an action on this post.
        item.actions[r.actionType] = Math.max(item.actions[r.actionType] ?? 0, r.value);
    }
    return [...byPost.values()];
}
