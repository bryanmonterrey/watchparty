"use client";

import { useEffect, useRef } from "react";
import { writeChatSnapshot, type ChatSnapshot } from "@/lib/community/chat-snapshot";

/**
 * Keeps a channel's newest page mirrored into localStorage so the next visit
 * paints instantly. See `lib/community/chat-snapshot.ts` for why this exists
 * and why the payload is superjson.
 *
 * Writes are debounced: `data` gets a fresh identity on every refetch,
 * optimistic patch, reaction toggle and typing-driven invalidate, and a
 * snapshot write is a synchronous serialize plus a storage write. At chat rates
 * that is exactly the kind of work that shows up as input latency.
 */

const WRITE_DEBOUNCE_MS = 1_000;

/**
 * @param channelId  Channel the data belongs to.
 * @param data       The infinite query's `data`.
 * @param isPlaceholder `true` while the query is showing a snapshot rather than
 *   server data. Writing then would re-persist what we just read — refreshing
 *   its `savedAt` on every visit, so an entry that is never re-fetched could
 *   outlive its max age indefinitely and stay first in line to be painted.
 */
export function useChatSnapshot(
    channelId: string,
    data: ChatSnapshot | undefined,
    isPlaceholder: boolean,
): void {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The latest values, for the flush paths that fire outside render. All
    // three are set together during render so they can never disagree — a
    // `channelId` newer than its `data` would file one channel's messages under
    // another, which is the same trap `useComposerDraft` guards against and a
    // far worse one here: it would paint someone else's conversation.
    const channelRef = useRef(channelId);
    const dataRef = useRef(data);
    const placeholderRef = useRef(isPlaceholder);
    channelRef.current = channelId;
    dataRef.current = data;
    placeholderRef.current = isPlaceholder;

    useEffect(() => {
        if (isPlaceholder || !data?.pages?.length) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            writeChatSnapshot(channelId, data);
        }, WRITE_DEBOUNCE_MS);
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [channelId, data, isPlaceholder]);

    // No separate flush on channel change: the debounced write above already
    // captured its own (channelId, data) pair, and its cleanup cancels the
    // pending timer when you leave. Losing that last write costs nothing —
    // a snapshot is rewritten every second while the channel is open.

    // Last-chance persist. Closing a tab or navigating away doesn't reliably
    // run an unmount effect; `pagehide` fires for bfcache too.
    useEffect(() => {
        const persist = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (!placeholderRef.current) writeChatSnapshot(channelRef.current, dataRef.current);
        };
        window.addEventListener("pagehide", persist);
        return () => {
            window.removeEventListener("pagehide", persist);
            persist();
        };
    }, []);
}
