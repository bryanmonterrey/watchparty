import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema/content";
import { redis } from "@/lib/cache";

/**
 * Count one view, at most once per viewer per post per day.
 *
 * ## Why this is deduped at all
 *
 * `content.incrementView` is public and unauthenticated by design — signed-out
 * reads are real views. It previously had no dedupe of any kind, which made it
 * two problems at once:
 *
 * 1. **It writes `baseScore`**, the value that ranks the feed and the trending
 *    board. An unauthenticated, unlimited endpoint that moves a ranking signal
 *    is a ranking-manipulation vector, not merely a sloppy counter: a loop
 *    against it promotes any post.
 * 2. **Every call is an `UPDATE` on `posts`**, and `browse-feed` subscribes to
 *    `postgres_changes` on that table with no filter — so one person's view
 *    broadcast to every connected client, each of whom then patched three feed
 *    tabs. The cost grew with viewers × posts × viewers.
 *
 * The client made it worse without meaning to: `post-card` guards with a
 * per-MOUNT ref, and the feed windows its rows, so scrolling up and back down
 * remounts a card and counts it again.
 *
 * ## Not `seenPosts`
 *
 * That table has a `(userId, postId)` unique constraint and looks like the
 * obvious dedupe. It isn't: `markPostsSeen` writes it for feed
 * de-duplication on its own schedule, so a post marked seen first would never
 * be counted at all. "Have you seen this" and "have we counted this" are
 * different questions and must not share a row.
 *
 * ## Fails open
 *
 * If Redis is unreachable the view is counted rather than dropped. An
 * undercount is a worse product outcome than a rare double count, and the
 * abuse this guards against needs sustained volume to matter — which an
 * outage doesn't supply.
 */

/** One view per viewer per post per day. */
export const VIEW_DEDUPE_SECONDS = 24 * 60 * 60;

/**
 * @param viewer stable handle for the caller — user id when signed in, else
 *   client IP. Coarse for shared IPs, but it is the only stable handle a
 *   signed-out caller has, and it still bounds a loop.
 * @returns whether this call actually incremented.
 */
export async function recordView(postId: string, viewer: string): Promise<boolean> {
    try {
        const fresh = await redis.set(`view:${postId}:${viewer}`, 1, {
            nx: true,
            ex: VIEW_DEDUPE_SECONDS,
        });
        if (!fresh) return false;
    } catch {
        // Redis down — fall through and count it.
    }

    await db
        .update(posts)
        .set({
            views: sql`${posts.views} + 1`,
            baseScore: sql`${posts.likes} * 3.0 + ${posts.reposts} * 2.0 + ${posts.comments} * 2.0 + (${posts.views} + 1) * 0.1`,
        })
        .where(eq(posts.id, postId));
    return true;
}

/** The caller's stable handle, preferring the account over the network path. */
export function viewerHandle(userId: string | null | undefined, headers: Headers): string {
    return userId ?? headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? "anon";
}
