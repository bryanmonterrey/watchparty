"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useMiniPlayer } from "@/contexts/mini-player-context";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ADS_ENABLED } from "@/lib/ads/config";
import { PlayerLoadingScreen } from "./player-loading";
import { VideoMetadata } from "./video-metadata";
import { UpNextSidebar } from "./up-next-sidebar";

// ssr:false, and it is load-bearing for the DEPLOY, not just for speed.
//
// use-player.ts is the only module in the app that touches hls.js, and it
// already imports it lazily (`import("hls.js")` inside an effect, so it never
// runs on the server). Turbopack bundles a dynamic import's target regardless
// of whether the code path can be reached, so hls.js still landed in an SSR
// chunk: 152 KiB gzipped of a browser-only video player shipped inside the
// Cloudflare Worker. Workers cap the compressed script at 10 MiB and this app
// builds to ~10.0 MiB, so that chunk is a meaningful slice of the headroom.
//
// `ssr: false` drops the whole player subtree out of the server graph, which is
// the only lever Next gives you here — a runtime guard cannot remove a module
// from the bundle. Nothing is lost visually: the player is entirely
// client-driven and its first paint was the spinner anyway.
const VideoPlayer = dynamic(
    () => import("./video-player").then((m) => m.VideoPlayer),
    { ssr: false, loading: () => <PlayerLoadingScreen /> },
);

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
        // Home's frame, exactly. The gutters hang off the COLUMN rather than the
        // row — ml-4 on the left (the page's old px-4, kept) and 1.25 before the
        // rail — so the screen fills everything between them. The header offset
        // is a MARGIN on the column for the same reason home does it that way:
        // padding would run the column's fill up behind the fixed header.
        <div className="relative flex min-h-dvh w-full flex-col lg:flex-row">
            {/* ── Main column ─────────────────────────────────────────────── */}
            <main className="relative flex min-w-0 flex-1 flex-col pb-4 md:mt-[var(--header-height)] lg:ml-4 lg:mr-3">
                {/* No mx-auto and no max-w: the screen spans the column, left
                    edge to the rail. It used to be centred inside a max-w, which
                    is what left the gap down the left side. */}
                <div className="relative aspect-video w-full">
                    {isGlobalMiniActive ? (
                        /* Placeholder shown while this video plays in the global mini player */
                        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3">
                            <img
                                src={video?.thumbnailUrl ?? ""}
                                className="absolute inset-0 w-full h-full object-cover opacity-20"
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
                    isReposted={video?.isReposted ?? false}
                    isBookmarked={video?.isBookmarked ?? false}
                    author={video?.author ?? { id: "", name: null, username: null, avatar_url: null, verifiedTier: null, followerCount: 0 }}
                    token={video?.token ?? null}
                    isLoading={isLoading}
                />
            </main>

            {/* ── Up Next sidebar ──────────────────────────────────────────── */}
            <UpNextSidebar postId={postId} />
        </div>
    );
}
