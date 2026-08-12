"use client";

import { useCallback, useEffect, useRef } from "react";

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
 * A STABLE `placeholderData` reader — pass this, never an inline arrow.
 *
 * query-core reuses the previous placeholder instead of recomputing it only
 * when the function is referentially identical between renders:
 *
 *   queryObserver.js:267
 *     if (prevResult?.isPlaceholderData &&
 *         options.placeholderData === prevResultOptions?.placeholderData)
 *
 * An inline `() => store.read(key)` fails that identity check every render, so
 * the branch above is never taken and the store is re-read and re-parsed with
 * superjson each time. That is not a brief cost on these surfaces: the private
 * ones gate `enabled` on the session, and a disabled query stays `pending`
 * (`query.js:446` — status tracks data, never `enabled`), so the placeholder
 * path runs for the whole wait rather than for one render.
 *
 * Keyed on `key` so a viewer or channel change still re-reads exactly once.
 *
 * Takes the read FUNCTION rather than the store, which makes one signature
 * cover both shapes in use: `someStore.read` (a plain closure in the object
 * `createSnapshotStore` returns — no `this`, so passing it bare is safe) and
 * the standalone `readFeedSnapshot` / `readChatSnapshot`. Both are
 * module-level, so both are referentially stable; an inline wrapper object
 * would not be, and would quietly reintroduce exactly the miss this fixes.
 */
export function useSnapshotPlaceholder<T>(
    read: (key: string) => T | undefined,
    key: string,
): () => T | undefined {
    return useCallback(() => read(key), [read, key]);
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
