"use client";

import { chatSnapshotStore, type ChatSnapshot } from "@/lib/community/chat-snapshot";
import { useSnapshot } from "@/hooks/use-snapshot";

/**
 * Keeps a channel's newest page mirrored into localStorage so the next visit
 * paints instantly.
 *
 * The debounce and the `pagehide` flush live in `useSnapshot` now — six
 * surfaces share them, and two copies of a "write on the way out" path is
 * exactly the kind of thing that drifts and then only fails on the surface
 * nobody re-tested. Kept as its own hook because the call site reads better
 * naming the channel, and because chat is the one surface NOT keyed by viewer
 * (see `lib/community/chat-snapshot.ts` for why).
 *
 * @param channelId  Channel the data belongs to.
 * @param data       The infinite query's `data`.
 * @param isPlaceholder `true` while the query is showing a snapshot rather than
 *   server data.
 */
export function useChatSnapshot(
    channelId: string,
    data: ChatSnapshot | undefined,
    isPlaceholder: boolean,
): void {
    useSnapshot(chatSnapshotStore, channelId, data, isPlaceholder);
}
