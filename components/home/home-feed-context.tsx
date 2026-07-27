"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";

// The home feed's data + selection, shared across the page's columns.
//
// This is the carousel's algorithm carried over unchanged — same procedure,
// same page size, same repost dedupe. Only the presentation moved: the picker
// used to be a 3x3 grid beside the player, and is now the right rail's list.
//
// It lives in context rather than inside either column because the hero sits
// in <main> and the picker in <aside>, so no ancestor short of the page row
// contains both. One query serves both either way — TanStack Query dedupes on
// the key, so consuming it twice would not double-fetch — but the ACTIVE
// selection has to be shared, and that is what actually needs a provider.

export interface HomeFeedVideo {
    id: string;
    title: string;
    videoUrl?: string | null;
    thumbnailUrl: string | null;
    /** Live stream rather than a VOD — drives the LIVE badge. */
    isLive?: boolean | null;
    /** Launched token (if any) — drives the market-cap chip. */
    ticker?: string | null;
    tokenId?: string | null;
    tokenAddress?: string | null;
    marketCapUsd?: number | null;
    // ─── Below here: already returned by content.getVideoFeed, declared for
    // the video header under the hero. Nothing new is fetched for them.
    views?: number | null;
    likes?: number | null;
    /** Server-resolved for the signed-in viewer — no follow-up query needed. */
    isLiked?: boolean | null;
    createdAt?: Date | string | null;
    duration?: number | null;
    user: {
        id?: string | null;
        name?: string | null;
        username: string | null;
        avatar_url: string | null;
        /**
         * Already the EFFECTIVE tier: the feed resolves it through
         * effectiveVerifiedTier, so it is null for anyone who has hidden their
         * badge and needs no further checking here.
         */
        verifiedTier?: "verified" | "business" | "government" | null;
    };
}

interface HomeFeedValue {
    videos: HomeFeedVideo[];
    /** The video the hero is showing — the first one until something is picked. */
    active: HomeFeedVideo | undefined;
    setActiveId: (id: string) => void;
    isLoading: boolean;
}

const HomeFeedContext = createContext<HomeFeedValue | null>(null);

export function useHomeFeed() {
    const value = useContext(HomeFeedContext);
    if (!value) throw new Error("useHomeFeed must be used inside <HomeFeedProvider>");
    return value;
}

export function HomeFeedProvider({ children }: { children: React.ReactNode }) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const feed = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 12 },
        { getNextPageParam: (p) => p.nextCursor }
    );

    const videos = useMemo(() => {
        // Dedupe by video id: a repost and its original share one `id` (they are
        // the same video) and differ only by `feedKey`. Keep the first, so a
        // repost can't take the hero slot twice or collide on a list key.
        const raw = feed.data?.pages.flatMap((p) => p.videos) ?? [];
        return [...new Map(raw.map((v) => [v.id, v])).values()] as HomeFeedVideo[];
    }, [feed.data]);

    const value = useMemo<HomeFeedValue>(() => {
        // Falling back to videos[0] rather than storing it means the hero fills
        // in as soon as the feed lands, without an effect to seed the selection.
        const active = videos.find((v) => v.id === activeId) ?? videos[0];
        return { videos, active, setActiveId, isLoading: feed.isLoading };
    }, [videos, activeId, feed.isLoading]);

    return <HomeFeedContext.Provider value={value}>{children}</HomeFeedContext.Provider>;
}
