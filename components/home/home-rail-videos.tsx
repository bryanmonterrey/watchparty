"use client";

import { RailRow, RailRowSkeleton } from "@/components/rails/rail-row";
import { useHomeFeed } from "./home-feed-context";

// The rail's video list — this is the carousel's picker, relocated. Clicking a
// row makes it the hero, exactly as clicking a cell in the old 3x3 grid did.
//
// The row itself is components/rails/rail-row.tsx, shared with the video and
// live rails so the three can't drift apart. This one passes onSelect instead
// of href: it's the only rail that picks rather than navigates.
const SKELETON_COUNT = 5;

export function HomeRailVideos() {
    const { videos, active, setActiveId, isLoading } = useHomeFeed();

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
        <div className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
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
        </div>
    );
}
