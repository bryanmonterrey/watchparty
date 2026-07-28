"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { VerifiedBadgeIcon } from "@/components/icons";

type TabId = "all" | "creator" | "related" | "watched";

interface UpNextVideo {
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    views: number;
    createdAt: Date;
    author: { 
        id: string; 
        name: string | null; 
        username: string | null; 
        avatar_url: string | null;
        verifiedTier: string | null;
    };
}

interface UpNextSidebarProps {
    postId: string;
    creatorId: string;
    creatorName: string | null;
    category: string | null;
    isLoading?: boolean;
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

function VideoSkeleton() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-2 rounded-xl p-1">
                    <div className="shimmer-skeleton w-40 aspect-video rounded-lg shrink-0 opacity-50" />
                    <div className="flex-1 min-w-0 py-0.5 flex flex-col">
                        <div className="shimmer-skeleton h-3.5 w-full rounded-full mb-1" />
                        <div className="shimmer-skeleton h-3.5 w-3/4 rounded-full" />
                        <div className="shimmer-skeleton h-2.5 w-2/3 rounded-full mt-1.5 opacity-60" />
                    </div>
                </div>
            ))}
        </>
    );
}

function VideoList({ videos }: { videos: UpNextVideo[] }) {
    if (videos.length === 0) {
        return <p className="text-sm font-medium text-zinc-500 text-center py-8">No videos yet</p>;
    }

    return (
        <>
            {videos.map(v => (
                <Link
                    key={v.id}
                    href={`/video/${v.id}`}
                    className="flex gap-2 group rounded-xl hover:bg-white/10 p-1 transition-colors"
                >
                    <div className="relative shrink-0 w-40 aspect-video rounded-lg overflow-hidden bg-zinc-800">
                        {v.thumbnailUrl ? (
                            <img src={v.thumbnailUrl} alt={v.title ?? ""} className="object-cover w-full h-full absolute inset-0" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                <Play className="w-5 h-5 text-zinc-600" />
                            </div>
                        )}
                        {v.duration ? (
                            <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 py-0.5 rounded font-medium">
                                {formatDuration(v.duration)}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                        <p className="text-sm font-semibold text-zinc-100 line-clamp-2 leading-tight group-hover:text-white">
                            {v.title ?? "Untitled"}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                            <p className="text-xs text-zinc-400 truncate">@{v.author.username}</p>
                            {v.author.verifiedTier === "verified" && (
                                <VerifiedBadgeIcon className="w-3 h-3 shrink-0" />
                            )}
                        </div>
                        <p className="text-xs text-zinc-500">
                            {formatViews(v.views)} views • {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                        </p>
                    </div>
                </Link>
            ))}
        </>
    );
}

export function UpNextSidebar({ postId, creatorId, creatorName, category, isLoading }: UpNextSidebarProps) {
    const [activeTab, setActiveTab] = useState<TabId>("all");

    const tabs = useMemo<{ id: TabId; name: string }[]>(() => [
        { id: "all", name: "All" },
        { id: "creator", name: creatorName ? `From ${creatorName.split(" ")[0]}` : "Creator" },
        { id: "related", name: "Related" },
        { id: "watched", name: "Watched" },
    ], [creatorName]);

    // ─── Queries ──────────────────────────────────────────────────────────
    const { data: allVideos } = trpc.content.getPublicVideos.useQuery(
        { excludePostId: postId, limit: 20 },
        { enabled: activeTab === "all" && !isLoading }
    );

    const { data: creatorVideos } = trpc.content.getVideosByUser.useQuery(
        { userId: creatorId, excludePostId: postId, limit: 20 },
        { enabled: activeTab === "creator" && !isLoading && !!creatorId }
    );

    const { data: relatedVideos } = trpc.content.getRelatedVideos.useQuery(
        { category, excludePostId: postId, limit: 20 },
        { enabled: activeTab === "related" && !isLoading }
    );

    // For "watched", we show all videos sorted by views (most-watched first) — client-side filter from allVideos
    const { data: watchedVideos } = trpc.content.getPublicVideos.useQuery(
        { excludePostId: postId, limit: 20 },
        { enabled: activeTab === "watched" && !isLoading }
    );

    const currentVideos = useMemo(() => {
        switch (activeTab) {
            case "all": return allVideos?.videos;
            case "creator": return creatorVideos?.videos;
            case "related": return relatedVideos?.videos;
            case "watched": {
                const vids = watchedVideos?.videos;
                if (!vids) return undefined;
                return [...vids].sort((a, b) => b.views - a.views);
            }
            default: return undefined;
        }
    }, [activeTab, allVideos, creatorVideos, relatedVideos, watchedVideos]);

    return (
        // 340px is the app's one right-rail width — the profile page's rail and
        // the live page's chat are both on it. This was the last 396.
        <div className="hidden lg:flex flex-col w-[340px] shrink-0 overflow-y-auto custom-scrollbar sticky top-20">
            {/* Tabs */}
            <div className="pb-2 shrink-0">
                {isLoading ? (
                    <div className="flex gap-1">
                        <div className={`shimmer-skeleton h-8 rounded-full w-72`} />
                    </div>
                ) : (
                    <div className="flex gap-1 flex-wrap relative">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "py-1.5 px-4 text-md font-bold cursor-pointer rounded-full transition-all relative z-10",
                                    activeTab === tab.id
                                        ? "text-white2"
                                        : "text-zinc-500 hover:text-white hover:bg-zinc-900/65"
                                )}
                            >
                                {tab.name}
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="upNextTabHighlight"
                                        className="absolute inset-0 bg-zinc-500/35 text-zinc-950 rounded-full -z-10"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 250, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Video List */}
            <div className="flex-1 py-2 space-y-0.5">
                {isLoading || !currentVideos ? (
                    <VideoSkeleton />
                ) : (
                    <VideoList videos={currentVideos} />
                )}
            </div>
        </div>
    );
}
