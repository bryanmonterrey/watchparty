"use client";

import { useEffect, useRef } from "react";
import { RailRow, RailRowSkeleton } from "@/components/rails/rail-row";
import { useHomeFeed } from "./home-feed-context";

// The rail's video list — this is the carousel's picker, relocated. Clicking a
// row makes it the hero, exactly as clicking a cell in the old 3x3 grid did.
//
// The row itself is components/rails/rail-row.tsx, shared with the video and
// live rails so the three can't drift apart. This one passes onSelect instead
// of href: it's the only rail that picks rather than navigates.
const SKELETON_COUNT = 5;
// Rows appended per page — enough to cover the sentinel's lead so the list
// never visibly stops while the next page lands.
const LOADING_MORE_ROWS = 3;
// How far ahead of the bottom the next page starts loading. Roughly three rows,
// so scrolling at a normal speed never reaches an empty end.
const PREFETCH_MARGIN = "400px";

export function HomeRailVideos() {
    const { videos, active, setActiveId, isLoading, hasMore, isLoadingMore, loadMore } = useHomeFeed();

    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Infinite scroll. The observer's root is the rail itself, not the viewport:
    // this list scrolls inside a fixed-height sticky column, so a viewport-rooted
    // observer would never see the sentinel move.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) loadMore();
            },
            { root: scrollRef.current, rootMargin: PREFETCH_MARGIN },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadMore]);

    if (isLoading) {
        return (
            <div className="flex flex-col">
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                    <RailRowSkeleton key={i} index={i} count={SKELETON_COUNT} />
                ))}
            </div>
        );
    }

    // The rail is a fixed-height sticky column, so the list scrolls inside it
    // rather than growing the page.
    return (
        <div ref={scrollRef} className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
            {videos.map((v) => (
                <RailRow
                    key={v.id}
                    thumbnailUrl={v.thumbnailUrl}
                    isLive={v.isLive}
                    username={v.user.username}
                    verifiedTier={v.user.verifiedTier}
                    title={v.title}
                    isActive={v.id === active?.id}
                    onSelect={() => setActiveId(v.id)}
                />
            ))}

            {isLoadingMore &&
                Array.from({ length: LOADING_MORE_ROWS }).map((_, i) => (
                    <RailRowSkeleton key={`more-${i}`} index={i} count={LOADING_MORE_ROWS} />
                ))}

            {/* Zero-height tripwire below the last row. Kept mounted only while
                there's more to fetch, so reaching the cap simply ends the scroll. */}
            {hasMore && <div ref={sentinelRef} aria-hidden className="h-px shrink-0" />}
        </div>
    );
}
