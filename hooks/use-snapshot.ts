"use client";

import { useEffect, useRef } from "react";

/**
 * Mirror a query's data into a snapshot store so the next visit paints
 * instantly. See `lib/snapshot/store.ts` for why snapshots exist at all.
 *
 * ## Writes are debounced
 *
 * `data` gets a fresh identity on every refetch, optimistic patch, poll and
 * invalidate — chat adds a reaction toggle and a typing-driven invalidate on
 * top. A write is a synchronous superjson serialize plus a storage write, and
 * at those rates that is exactly the kind of work that shows up as input
 * latency. One write a second is plenty for something only read on next visit.
 */

const WRITE_DEBOUNCE_MS = 1_000;

export interface SnapshotWriter<T> {
    write(key: string, value: T): void;
}

/**
 * @param store  A module-level snapshot store. Held in a ref and deliberately
 *   NOT an effect dependency: a store built inline would get a new identity
 *   every render, restart the debounce every render, and therefore never fire.
 * @param key    Where this data belongs. For viewer-dependent surfaces this
 *   must include the viewer id — see `viewerKey` in `lib/snapshot/keys.ts`.
 * @param data   The query's `data`.
 * @param isPlaceholder `true` while the query is showing a snapshot rather than
 *   server data. Writing then would re-persist what we just read, refreshing
 *   `savedAt` on every visit — so an entry that never successfully refetches
 *   could outlive its max age indefinitely and stay first in line to be
 *   painted. The staleness guard only works if we stop touching it.
 */
export function useSnapshot<T>(
    store: SnapshotWriter<T>,
    key: string,
    data: T | undefined,
    isPlaceholder: boolean,
): void {
    const storeRef = useRef(store);
    storeRef.current = store;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Latest values for the flush paths that fire outside render. All three are
    // set together during render so they can never disagree — a `key` newer
    // than its `data` would file one channel's messages, or one account's feed,
    // under another. That is worse than losing the write.
    const keyRef = useRef(key);
    const dataRef = useRef(data);
    const placeholderRef = useRef(isPlaceholder);
    keyRef.current = key;
    dataRef.current = data;
    placeholderRef.current = isPlaceholder;

    useEffect(() => {
        if (isPlaceholder || data == null) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            storeRef.current.write(key, data);
        }, WRITE_DEBOUNCE_MS);
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [key, data, isPlaceholder]);

    // No separate flush when `key` changes: the debounced write above captured
    // its own (key, data) pair and its cleanup cancels the pending timer on the
    // way out. Losing that last write costs nothing — it is rewritten a second
    // later, and the previous visit already stored a usable page.

    // Last-chance persist. Closing a tab or navigating away doesn't reliably
    // run an unmount effect; `pagehide` fires for bfcache too.
    useEffect(() => {
        const persist = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            const data = dataRef.current;
            if (!placeholderRef.current && data != null) storeRef.current.write(keyRef.current, data);
        };
        window.addEventListener("pagehide", persist);
        return () => {
            window.removeEventListener("pagehide", persist);
            persist();
        };
    }, []);
}
