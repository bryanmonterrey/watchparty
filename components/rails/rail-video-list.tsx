"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { RailRow, RailRowSkeleton } from "./rail-row";
import { RailRowMenu } from "./rail-row-menu";
import { RAIL_ICON_TAB } from "./rail-tabs";
import { stableHoverColor } from "@/lib/stable-hover-color";

// What sits under the rail tabs on the video and live pages.
//
// The tabs are shared with home, where they're currently decorative (that rail
// picks the hero and ignores the tab). Here each one is wired to whatever the
// server can actually answer:
//
//   trending → public videos, most-viewed first
//   For you  → public videos in the feed's own order (baseScore, then recency)
//   Live     → stream.listLive, ordered by viewers
//   New      → public videos, newest first
//   Upcoming → nothing. Scheduled streams don't exist yet, so this says so
//              rather than quietly showing the same list as another tab.

const SKELETON_COUNT = 6;
const LIMIT = 20;

export function RailVideoList({ tab, excludePostId }: { tab: string; excludePostId?: string }) {
    const wantsVideos = tab !== "Live" && tab !== "Upcoming";

    const { data: videoData, isLoading: videosLoading } = trpc.content.getPublicVideos.useQuery(
        { excludePostId, limit: LIMIT },
        { enabled: wantsVideos, staleTime: 60_000 },
    );

    const { data: liveRows, isLoading: liveLoading } = trpc.stream.listLive.useQuery(
        { limit: 12 },
        { enabled: tab === "Live", staleTime: 30_000 },
    );

    // One query serves three tabs — the ordering is the only difference, and
    // sorting twenty rows here is cheaper than three round trips.
    const videos = useMemo(() => {
        const rows = videoData?.videos;
        if (!rows) return undefined;
        if (tab === RAIL_ICON_TAB) return [...rows].sort((a, b) => b.views - a.views);
        if (tab === "New") {
            return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return rows;
    }, [videoData, tab]);

    if (tab === "Upcoming") {
        return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">Nothing scheduled yet</p>;
    }

    const isLoading = tab === "Live" ? liveLoading : videosLoading;
    if (isLoading) {
        return (
            <div className="flex flex-col">
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                    <RailRowSkeleton key={i} index={i} count={SKELETON_COUNT} />
                ))}
            </div>
        );
    }

    if (tab === "Live") {
        if (!liveRows?.length) {
            return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">No one is live right now</p>;
        }
        return (
            <div className="flex flex-col">
                {liveRows.map((s) => (
                    <RailRow
                        key={s.userId}
                        // A stream is a state of its host's profile now, not a
                        // route — so a live row goes to the host.
                        href={`/${s.username ?? ""}`}
                        isLive
                        username={s.username}
                        verifiedTier={s.verifiedTier}
                        title={s.title ?? `${s.name ?? s.username} is live`}
                        // Concurrent viewers, in the same slot a video's view
                        // count uses. ViewsStat prints an eye and a figure with
                        // no "views" label, so the number reads correctly for
                        // both. NO menu here: that menu acts on a POST, and a
                        // live stream doesn't have one — listLive returns a
                        // userId, not a postId.
                        views={s.viewerCount}
                        hoverColor={stableHoverColor(s.userId)}
                    />
                ))}
            </div>
        );
    }

    if (!videos?.length) {
        return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">No videos yet</p>;
    }

    return (
        <div className="flex flex-col bg-canvas">
            {/* views + menu are what made these read as a lesser version of
                home's rows. RailRow already supported both — this list simply
                wasn't passing them, so the video and live rails lost the
                engagement line and the options dots. */}
            {videos.map((v) => (
                <RailRow
                    key={v.id}
                    href={`/video/${v.id}`}
                    thumbnailUrl={v.thumbnailUrl}
                    username={v.author.username}
                    verifiedTier={v.author.verifiedTier}
                    title={v.title}
                    views={v.views}
                    menu={<RailRowMenu postId={v.id} userId={v.author.id} />}
                    hoverColor={stableHoverColor(v.id)}
                />
            ))}
        </div>
    );
}
