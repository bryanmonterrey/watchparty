import type { InfiniteData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { createInfiniteSnapshotStore } from "@/lib/snapshot/infinite";

/**
 * Snapshot of the feed's first page, per tab and per viewer.
 *
 * The feed is the app's most revisited surface and its slowest first paint —
 * `content.getFeed` sources a 200-row candidate pool and re-ranks it, and for a
 * signed-in viewer there is no Redis cache-aside at all (`feed:anon:` only
 * caches the logged-out feed, because the rows are viewer-specific). So every
 * cold arrival at /feed waits on that, every time.
 *
 * ## Why no separate interaction payload
 *
 * `browse-feed` reads hearts as `item.data.isLiked ?? likedPostIdsRef...`, and
 * it would be reasonable to assume the snapshot has to carry that fallback
 * state too or every heart pops in a beat late. It doesn't: `postSelectFields`
 * in `server/lib/post-shape.ts` projects `isLiked`, `isBookmarked` and
 * `isReposted` onto every row, and `getFeed` uses it. The three bulk
 * `getLikedPostIds`-style queries are a fallback for rows the server didn't
 * annotate. Snapshot the page and the hearts come with it.
 *
 * ## Which is exactly why this is keyed by viewer
 *
 * Those columns are `EXISTS` subqueries against `viewerId`. A page snapshotted
 * by one account is *wrong* for the next, and this app has multi-session
 * account switching with no sign-out in between — so an un-keyed snapshot would
 * paint the previous account's likes onto someone else's feed for one frame.
 * See `lib/snapshot/keys.ts`.
 */

type FeedPage = inferRouterOutputs<AppRouter>["content"]["getFeed"];

export type FeedSnapshot = InfiniteData<FeedPage, string | undefined>;

export const feedSnapshotStore = createInfiniteSnapshotStore<FeedPage, string | undefined>({
    prefix: "watchparty.snap.feed:",
    version: 1,
    /**
     * Three tabs × the accounts a device actually uses. Six covers a two-account
     * device browsing every tab; past that the least recently saved goes, which
     * is the tab you stopped reading.
     */
    maxEntries: 6,
    /**
     * Larger than chat's 256KB: a page is 20 posts carrying author, media refs,
     * counts and quoted-post bodies, where a chat page is 50 short rows. A page
     * over this simply isn't snapshotted — the surface still works, it just
     * doesn't paint early, which is the correct way for this to fail.
     */
    maxBytes: 384 * 1024,

    // `createdAt` must come back as a real `Date`: post cards run it through
    // date-fns for relative timestamps, which produces "Invalid Date" on a
    // string rather than throwing — a silently wrong row is worse than none.
    validatePage: (page) => {
        if (!Array.isArray(page?.posts)) return false;
        const first = page.posts[0] as { createdAt?: unknown } | undefined;
        return !first || first.createdAt instanceof Date;
    },

    sanitizePage: (page) => (page.posts.length ? page : null),
});

/** The feed's first page for `key`, shaped for `placeholderData`. */
export function readFeedSnapshot(key: string): FeedSnapshot | undefined {
    return feedSnapshotStore.read(key);
}
