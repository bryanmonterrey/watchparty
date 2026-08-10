import type { InfiniteData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { createInfiniteSnapshotStore } from "@/lib/snapshot/infinite";

/**
 * Per-channel snapshot of the newest page of chat, so reopening a channel
 * paints instantly instead of showing seven skeleton rows.
 *
 * The mechanics — versioning, staleness, LRU eviction, byte cap, quota retry,
 * superjson — moved to `lib/snapshot/` when the feed, notifications, bookmarks
 * and the coin rails wanted the same behaviour. What stays here is only what is
 * true of chat specifically: what a channel's page looks like, and what must
 * never be persisted from one.
 *
 * ## Not keyed by viewer, unlike most snapshot surfaces
 *
 * A chat page is the same rows for everyone in the channel — there is no
 * `isLiked`-style per-viewer projection on a message. Reactions carry user ids,
 * but they carry them for every member, so a snapshot written by one account is
 * correct for the next. Membership is enforced server-side on the refetch that
 * runs behind the paint, and `clearAllSnapshots()` on sign-out removes these
 * along with everything else.
 */

type MessagesPage = inferRouterOutputs<AppRouter>["community"]["getMessages"];

/**
 * The `pageParam` type is `ExtractCursorType<input>` — the procedure's `cursor`
 * is `string | undefined`, and the first page's param is `undefined`.
 */
export type ChatSnapshot = InfiniteData<MessagesPage, string | undefined>;

export const chatSnapshotStore = createInfiniteSnapshotStore<MessagesPage, string | undefined>({
    /**
     * The original prefix, kept verbatim. Renaming it to match the newer
     * `watchparty.snap.*` convention would orphan every snapshot already sitting
     * in a real browser: nothing would scan that prefix again, so those entries
     * would never be read and never be evicted.
     */
    prefix: "watchparty.chat-snapshot.v1:",
    /**
     * Still 1. The envelope's payload field was renamed when this moved onto the
     * shared store, so entries written by the previous build decode to
     * `undefined` and are simply not painted — then the next successful load
     * overwrites that same key. It self-heals per channel, which is a better
     * trade than bumping the version and dropping everyone's chat snapshots at
     * once for a change that is invisible to the user.
     */
    version: 1,
    maxEntries: 8,

    // A row's `createdAt` must survive as a real `Date`: the chat row does
    // `updatedAt.getTime() !== createdAt.getTime()`, which throws on a string.
    // superjson handles that; this asserts it actually happened, because the
    // stored type says `Date` either way and tsc cannot see the difference.
    validatePage: (page) => {
        if (!Array.isArray(page?.items)) return false;
        const first = page.items[0];
        return !first || first.createdAt instanceof Date;
    },

    // Never snapshot unconfirmed sends. An optimistic row is a local invention;
    // painting one back from storage would show a message that may never have
    // been sent, with no mutation in flight to ever resolve or roll it back.
    sanitizePage: (page) => {
        const items = page.items.filter(
            (m) => !m.id.startsWith("local-") && !(m as { pending?: boolean }).pending,
        );
        return items.length ? { ...page, items } : null;
    },
});

/**
 * The newest page for `channelId`, shaped for `placeholderData`, or `undefined`
 * when there's nothing usable. Never throws — a bad snapshot must degrade to
 * the normal loading state, not break the channel.
 */
export function readChatSnapshot(channelId: string): ChatSnapshot | undefined {
    return chatSnapshotStore.read(channelId);
}

/** Persist the newest page for `channelId`. */
export function writeChatSnapshot(channelId: string, data: ChatSnapshot | undefined): void {
    chatSnapshotStore.write(channelId, data);
}

/** Drop one channel's snapshot. */
export function clearChatSnapshot(channelId: string): void {
    chatSnapshotStore.clear(channelId);
}
