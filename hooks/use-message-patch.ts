"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";

/**
 * Patch a single message in the channel's cached timeline, immediately.
 *
 * Every message action — pin, unpin, edit, delete, react — is the same shape:
 * find one message in an infinite query's pages and replace it. Before this,
 * each one did `mutate` → await the round trip → `invalidate()` with no input →
 * refetch EVERY page of EVERY channel, and only then did the UI move. Pinning
 * took as long as sending used to.
 *
 * This is the shared half. Callers supply only what changes.
 *
 * ## Predicate matching, deliberately
 *
 * tRPC's `setInfiniteData` requires the input to hash identically to the
 * query's, and **silently does nothing** when it doesn't — which is the worst
 * failure mode available for an optimistic update: the UI just quietly stays
 * slow, and nothing errors. Matching on "this procedure, this channel" is
 * immune to the input shape drifting, and reads better besides.
 */

type Message = Record<string, unknown> & { id: string };
type Page = { items: Message[] };
type Infinite = { pages: Page[]; pageParams: unknown[] };

/** Snapshot of every matching query, for exact rollback. */
export type MessagesSnapshot = Array<[unknown, Infinite | undefined]>;

export function useMessagePatch(channelId: string | null) {
    const qc = useQueryClient();
    const utils = trpc.useUtils();

    const filter = useMemo(
        () => ({
            predicate: (q: { queryKey: unknown }) => {
                const key = q.queryKey as [string[], { input?: { channelId?: string }; type?: string }];
                const [path, meta] = key;
                return (
                    Array.isArray(path) &&
                    path[0] === "community" &&
                    path[1] === "getMessages" &&
                    meta?.type === "infinite" &&
                    !!channelId &&
                    meta?.input?.channelId === channelId
                );
            },
        }),
        [channelId],
    );

    /** Capture current data so a failed mutation can put back exactly what was there. */
    const snapshot = useCallback((): MessagesSnapshot => {
        return qc.getQueriesData<Infinite>(filter);
    }, [qc, filter]);

    const restore = useCallback(
        (snap: MessagesSnapshot | undefined) => {
            if (!snap) return;
            // Restore the SNAPSHOT rather than inverting the change — another
            // user's edit may have landed in between, and inverting would
            // clobber it.
            // `key as never` narrows setQueryData's data param to `undefined`,
            // so the cast has to be on the DATA, not the key.
            for (const [key, data] of snap) {
                qc.setQueryData(key as readonly unknown[], data as unknown);
            }
        },
        [qc],
    );

    /** Apply `updater` to the one message with this id, across every page. */
    const patch = useCallback(
        (messageId: string, updater: (message: Message) => Message) => {
            qc.setQueriesData<Infinite>(filter, (old) => {
                if (!old?.pages?.length) return old;
                let touched = false;
                const pages = old.pages.map((page) => {
                    if (!page.items?.some((m) => m.id === messageId)) return page;
                    touched = true;
                    return {
                        ...page,
                        items: page.items.map((m) => (m.id === messageId ? updater(m) : m)),
                    };
                });
                // Returning `old` unchanged when nothing matched avoids a
                // pointless re-render of every row in the channel.
                return touched ? { ...old, pages } : old;
            });
        },
        [qc, filter],
    );

    const invalidate = useCallback(() => {
        if (!channelId) return;
        // Scoped. The unscoped form refetched every page of every channel.
        void utils.community.getMessages.invalidate({ channelId });
    }, [utils, channelId]);

    return { snapshot, restore, patch, invalidate };
}
