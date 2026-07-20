"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useMiniPlayer } from "@/contexts/mini-player-context";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ADS_ENABLED } from "@/lib/ads/config";
import { VideoPlayer } from "./video-player";
import { VideoMetadata } from "./video-metadata";
import { UpNextSidebar } from "./up-next-sidebar";

interface VideoWatchPageProps {
    postId: string;
    creatorUsername: string;
}

export function VideoWatchPage({ postId, creatorUsername }: VideoWatchPageProps) {
    const { data: video, isLoading } = trpc.content.getVideoById.useQuery({ postId });
    const { miniPlayerData, enterMiniPlayer, exitMiniPlayer } = useMiniPlayer();
    const { data: session } = useAuthSession();
    const pathname = usePathname();

    const isGlobalMiniActive = miniPlayerData?.postId === postId;

    // VMAP tag (pre + mid-roll) served by our first-party /api/ad/vast route; the
    // player's IMA path consumes it. Undefined when ads are disabled (path stays dormant).
    const adTagUrl = useMemo(() => {
        if (!ADS_ENABLED || typeof window === "undefined") return undefined;
        return `${window.location.origin}/api/ad/vast?uid=${encodeURIComponent(session?.user?.id ?? "")}`;
    }, [session?.user?.id]);

    const handleEnterMiniPlayer = useCallback((currentTime: number) => {
        enterMiniPlayer({
            postId,
            videoUrl: video?.videoUrl ?? "",
            thumbnailUrl: video?.thumbnailUrl,
            title: video?.title,
            author: video?.author?.name,
            startTime: currentTime,
            watchUrl: pathname,
        });
    }, [postId, video, pathname, enterMiniPlayer]);

    if (!video && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-zinc-400 text-lg font-medium">Video not found</p>
                <Link href={`/${creatorUsername}`} className="text-lantern text-sm hover:underline">
                    Back to @{creatorUsername}
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-6 min-h-dvh md:min-h-[calc(100dvh-var(--header-height))] w-screen mx-auto px-4 md:pt-[var(--header-height)] pb-4">
            {/* ── Main column ─────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="relative w-full mx-auto aspect-video max-w-[min(1840px,calc((100dvh_-_172px)*16/9))]">
                    {isGlobalMiniActive ? (
                        /* Placeholder shown while this video plays in the global mini player */
                        <div className="absolute inset-0 rounded-3xl bg-black flex flex-col items-center justify-center gap-3">
                            <img
                                src={video?.thumbnailUrl ?? ""}
                                className="absolute inset-0 w-full h-full object-cover rounded-3xl opacity-20"
                                alt=""
                            />
                            <p className="relative text-white/70 text-sm">Playing in mini player</p>
                            <button
                                onClick={exitMiniPlayer}
                                className="relative px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                            >
                                Resume here
                            </button>
                        </div>
                    ) : (
                        <div className="absolute inset-0">
                            <VideoPlayer
                                postId={postId}
                                title={video?.title ?? null}
                                videoUrl={video?.videoUrl ?? null}
                                thumbnailUrl={video?.thumbnailUrl ?? null}
                                isLoading={isLoading}
                                adTagUrl={adTagUrl}
                                onEnterMiniPlayer={handleEnterMiniPlayer}
                            />
                        </div>
                    )}
                </div>
                <VideoMetadata
                    postId={postId}
                    title={video?.title ?? null}
                    content={video?.content ?? null}
                    views={video?.views ?? 0}
                    likes={video?.likes ?? 0}
                    comments={video?.comments ?? 0}
                    createdAt={video?.createdAt ?? new Date()}
                    category={video?.category ?? null}
                    isLiked={video?.isLiked ?? false}
                    author={video?.author ?? { id: "", name: null, username: null, avatar_url: null, verifiedTier: null, followerCount: 0 }}
                    token={video?.token ?? null}
                    isLoading={isLoading}
                />
            </div>

            {/* ── Up Next sidebar ──────────────────────────────────────────── */}
            <UpNextSidebar
                postId={postId}
                creatorId={video?.author?.id ?? ""}
                creatorName={video?.author?.name ?? null}
                category={video?.category ?? null}
                isLoading={isLoading}
            />
        </div>
    );
}
