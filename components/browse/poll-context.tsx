"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc/client";

export type PollData = NonNullable<inferRouterOutputs<AppRouter>["content"]["getPollForPost"]>;

type PollContextValue = {
    getPoll: (postId: string) => PollData | null;
};

const PollContext = createContext<PollContextValue | null>(null);

/**
 * Feed-level batched poll loader. Runs ONE getPollsForPosts query for every
 * visible post and exposes a postId -> poll lookup, so PollDisplay never fires a
 * per-post request (the old N+1 that fanned out to ~18 getPollForPost queries
 * per feed page). Posts without a poll are simply absent from the map.
 */
export function PollProvider({
    postIds,
    enabled = true,
    children,
}: {
    postIds: string[];
    enabled?: boolean;
    children: ReactNode;
}) {
    const { data } = trpc.content.getPollsForPosts.useQuery(
        { postIds },
        { enabled: enabled && postIds.length > 0, staleTime: 30_000 },
    );
    const polls = data?.polls;

    const value = useMemo<PollContextValue>(
        () => ({ getPoll: (postId) => polls?.[postId] ?? null }),
        [polls],
    );

    return <PollContext.Provider value={value}>{children}</PollContext.Provider>;
}

/**
 * Resolves the poll for a post. Inside a <PollProvider> (the feed) it reads from
 * the single batched query with no network call of its own. With no provider
 * (e.g. a standalone post page) it falls back to fetching just this post's poll.
 */
export function usePoll(postId: string): PollData | null {
    const ctx = useContext(PollContext);
    const inProvider = ctx !== null;

    // Disabled when a provider is present, so this never hits the network there.
    const { data } = trpc.content.getPollForPost.useQuery(
        { postId },
        { enabled: !inProvider },
    );

    return inProvider ? ctx.getPoll(postId) : (data ?? null);
}
