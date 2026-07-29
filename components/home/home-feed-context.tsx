"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
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
    /**
     * The coin's image, from the TOKEN row (tokens.imageUrl).
     *
     * NOT posts.token_image — that column is only ever written by the post
     * composer and is null for every video post in the database, which is why
     * the pill rendered blank. Token creation falls back to the video's
     * thumbnail when a creator sets no art, so this one is always populated.
     */
    tokenImageUrl?: string | null;
    tokenId?: string | null;
    tokenAddress?: string | null;
    marketCapUsd?: number | null;
    // ─── Below here: already returned by content.getVideoFeed, declared for
    // the video header under the hero. Nothing new is fetched for them.
    views?: number | null;
    likes?: number | null;
    /** Server-resolved for the signed-in viewer — no follow-up query needed. */
    isLiked?: boolean | null;
    isReposted?: boolean | null;
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

/**
 * Ceiling on how many videos the feed will accumulate in one session.
 *
 * The rail lazy-loads on scroll, so without a stop it would keep appending for
 * as long as someone keeps scrolling — every row staying mounted, every
 * thumbnail staying in memory. 300 is far past what anyone scrolls in a sitting
 * and still bounded. Hitting it ends the infinite scroll; a reload starts over.
 */
export const MAX_FEED_VIDEOS = 300;

interface HomeFeedValue {
    videos: HomeFeedVideo[];
    /** The video the hero is showing — the first one until something is picked. */
    active: HomeFeedVideo | undefined;
    setActiveId: (id: string) => void;
    /** Move to the next video in the feed — what the hero calls when one ends. */
    next: () => void;
    isLoading: boolean;
    /** Another page exists AND we're under the cap — drives the rail's sentinel. */
    hasMore: boolean;
    /** A page is in flight; the rail shows skeleton rows for it. */
    isLoadingMore: boolean;
    /** Pull the next page. Safe to call repeatedly — it no-ops when it can't. */
    loadMore: () => void;
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
        const unique = [...new Map(raw.map((v) => [v.id, v])).values()] as HomeFeedVideo[];
        // Cap AFTER deduping, so the limit counts videos someone can actually
        // see rather than rows the dedupe was going to drop anyway.
        return unique.slice(0, MAX_FEED_VIDEOS);
    }, [feed.data]);

    const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
    const hasMore = hasNextPage && videos.length < MAX_FEED_VIDEOS;
    const loadMore = useCallback(() => {
        if (hasMore && !isFetchingNextPage) void fetchNextPage();
    }, [hasMore, isFetchingNextPage, fetchNextPage]);

    // Advance the hero. Wraps at the end rather than stopping — the point is
    // that the screen keeps playing — but pulls the next page in first when
    // one exists, so a wrap only happens at the true end of the feed.
    const next = useCallback(() => {
        if (videos.length === 0) return;
        // -1 (nothing picked yet) becomes 0, which is the video the hero is
        // actually showing, since `active` falls back to videos[0].
        const current = Math.max(0, videos.findIndex((v) => v.id === activeId));
        // Same prefetch as before, now behind the cap: past MAX_FEED_VIDEOS the
        // hero wraps to the top instead of growing the list forever.
        if (current >= videos.length - 3) loadMore();
        setActiveId(videos[(current + 1) % videos.length].id);
    }, [videos, activeId, loadMore]);

    const value = useMemo<HomeFeedValue>(() => {
        // Falling back to videos[0] rather than storing it means the hero fills
        // in as soon as the feed lands, without an effect to seed the selection.
        const active = videos.find((v) => v.id === activeId) ?? videos[0];
        return {
            videos,
            active,
            setActiveId,
            next,
            isLoading: feed.isLoading,
            hasMore,
            isLoadingMore: isFetchingNextPage,
            loadMore,
        };
    }, [videos, activeId, next, feed.isLoading, hasMore, isFetchingNextPage, loadMore]);

    return <HomeFeedContext.Provider value={value}>{children}</HomeFeedContext.Provider>;
}
