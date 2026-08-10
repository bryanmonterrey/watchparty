import type { InfiniteData } from "@tanstack/react-query";
import { createSnapshotStore, type SnapshotStore } from "./store";

/**
 * A snapshot store for a `useInfiniteQuery`, which is nearly all of them.
 *
 * ## Only page 0 is kept
 *
 * Every surface using this opens at the first page — the feed at the top, chat
 * at the newest message, notifications at the most recent. Storing the pages a
 * long scrolling session accumulated would grow without bound to speed up a
 * screen that never starts there, and would push past the byte cap on exactly
 * the sessions that scrolled furthest.
 *
 * It also sidesteps a cursor trap. Restoring N pages restores N-1 cursors that
 * were minted against server state from a previous session; `fetchNextPage`
 * would then continue from whichever one happened to be last. One page means
 * one `pageParam`, the first, which is a constant rather than a stale token.
 *
 * ## The result is placeholder data, so it is never written back to the cache
 *
 * `read()` returns the exact `InfiniteData` shape `placeholderData` wants.
 * `placeholderData` — never `initialData` — is what keeps this honest:
 * `initialData` is written into the cache as though the server sent it, so it
 * inherits `staleTime` and can suppress the fetch outright, leaving a stale
 * snapshot as the only thing anyone ever sees. Placeholder data renders while
 * the real request is in flight, is replaced the moment it resolves, and is
 * flagged by `isPlaceholderData` so a surface can dim anything it must not
 * assert (a price, a balance, a count).
 */
export interface InfiniteSnapshotStore<TPage, TCursor> {
    read(key: string): InfiniteData<TPage, TCursor> | undefined;
    write(key: string, data: InfiniteData<TPage, TCursor> | undefined): void;
    clear(key: string): void;
    clearAll(): void;
}

export function createInfiniteSnapshotStore<TPage, TCursor = string | undefined>(opts: {
    prefix: string;
    version: number;
    maxEntries: number;
    maxBytes?: number;
    maxAgeMs?: number;
    /**
     * The `pageParam` the query's first page is fetched with. For every tRPC
     * cursor procedure here that is `undefined`, which is the default.
     */
    firstPageParam?: TCursor;
    /** Structural check on a decoded page — see `validate` in `store.ts`. */
    validatePage?: (page: TPage) => boolean;
    /** Drop or rewrite a page before storing. Return `null` to store nothing. */
    sanitizePage?: (page: TPage) => TPage | null;
}): InfiniteSnapshotStore<TPage, TCursor> {
    const firstPageParam = (opts.firstPageParam ?? undefined) as TCursor;

    const store: SnapshotStore<TPage> = createSnapshotStore<TPage>({
        prefix: opts.prefix,
        version: opts.version,
        maxEntries: opts.maxEntries,
        maxBytes: opts.maxBytes,
        maxAgeMs: opts.maxAgeMs,
        validate: opts.validatePage,
        sanitize: opts.sanitizePage,
    });

    return {
        read(key) {
            const page = store.read(key);
            if (page === undefined) return undefined;
            return { pages: [page], pageParams: [firstPageParam] };
        },
        write(key, data) {
            const page = data?.pages?.[0];
            if (page === undefined) return;
            store.write(key, page);
        },
        clear: store.clear,
        clearAll: store.clearAll,
    };
}
