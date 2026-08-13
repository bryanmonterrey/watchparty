"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { UserType } from "@/db/schema/auth/user";
import { useMiniPlayer } from "@/contexts/mini-player-context";

import { StreamPlayer } from "./stream-player";
import { StreamChat } from "./stream-chat";
import { StreamMetadata } from "./stream-metadata";
import { AboutCard } from "@/components/profile/about-card";

interface StreamWatchPageProps {
    host: UserType;
    /** Back to the host's profile. The stream isn't a route any more — it's a
     *  mode of /<username> — so leaving it is state, not navigation. */
    onShowProfile?: () => void;
}

export function StreamWatchPage({ host, onShowProfile }: StreamWatchPageProps) {
    const [showChat, setShowChat] = useState(true);
    const pathname = usePathname();
    const { miniPlayerData, enterMiniPlayer, exitMiniPlayer } = useMiniPlayer();

    const { data: stream, isLoading } = trpc.stream.getByUserId.useQuery({ userId: host.id });

    // Live viewer count + live-state: polled while watching (server caches
    // GetStream ~20s per channel, so many viewers share one AWS call).
    const { data: live } = trpc.stream.getViewers.useQuery(
        { userId: host.id },
        { refetchInterval: 30_000, refetchIntervalInBackground: false },
    );

    // Safely extract stream fields (live poll wins once it lands)
    const isLive = live?.isLive ?? stream?.isLive ?? false;
    const streamTitle = stream?.title ?? null;
    const streamCategory = stream?.category ?? null;
    const viewerCount = live?.viewerCount ?? stream?.viewerCount ?? 0;
    const playbackUrl = stream?.playbackUrl ?? null;
    const chatRoomArn = stream?.chatRoomArn ?? null;
    // Assuming stream.createdAt exists, fallback to now if missing for the UI
    const startedAt = (stream as any)?.createdAt ? new Date((stream as any).createdAt) : new Date();

    // ── Mini player: pop the live stream out so it follows across pages ──────
    // The id is keyed on the host so revisiting this page recognizes its own
    // stream and shows the placeholder instead of double-playing HLS.
    const miniId = `live:${host.id}`;
    const isMiniActive = miniPlayerData?.postId === miniId;

    const handleEnterMiniPlayer = useCallback(() => {
        if (!playbackUrl) return;
        enterMiniPlayer({
            postId: miniId,
            videoUrl: playbackUrl, // .m3u8 → GlobalMiniPlayer attaches via IVS
            thumbnailUrl: null,
            title: streamTitle ?? `${host.name ?? host.username} — Live`,
            author: host.name ?? host.username,
            startTime: 0, // live always joins at the edge
            watchUrl: pathname,
        });
    }, [playbackUrl, miniId, streamTitle, host.name, host.username, pathname, enterMiniPlayer]);

    return (
        // Home's frame: no page padding and no centred max-w. The gutters hang
        // off the COLUMN, exactly as they do on home — ml-4 on the left (the
        // page's old px-4, kept), 1.25 before the rail on the right — so the
        // screen fills everything between them instead of being centred inside
        // a max-w with dead space either side. Header clearance is a margin on
        // the column, not padding on the row.
        <div className="relative flex min-h-screen w-full flex-col lg:flex-row">
            {/* ── Main column ─────────────────────────────────────────────── */}
            <main className={cn("relative flex min-w-0 flex-col pb-4 md:mt-[var(--header-height)] lg:ml-4 lg:mr-3", showChat ? "flex-1" : "w-full")}>
                {isMiniActive ? (
                    <button
                        onClick={exitMiniPlayer}
                        className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black text-white"
                    >
                        <p className="text-lg font-bold">Playing in mini player</p>
                        <p className="text-sm text-zinc-400">Click to bring the stream back</p>
                    </button>
                ) : (
                    <StreamPlayer
                        playbackUrl={playbackUrl}
                        isLive={isLive}
                        host={host}
                        showChat={showChat}
                        onToggleChat={() => setShowChat(v => !v)}
                        onEnterMiniPlayer={handleEnterMiniPlayer}
                        isLoading={isLoading}
                    />
                )}

                <StreamMetadata
                    host={host}
                    isLive={isLive}
                    streamTitle={streamTitle}
                    streamCategory={streamCategory}
                    viewerCount={viewerCount}
                    startedAt={startedAt}
                    description={(stream as any)?.description ?? null}
                    isLoading={isLoading}
                    onNameClick={onShowProfile}
                />

                {/* The channel's About card — the same component the profile's
                    About tab renders, under the stream the way Twitch does it.
                    Full column width, matching the description block above. */}
                {!isLoading && (
                    <div className="mt-4">
                        <AboutCard user={host} />
                    </div>
                )}
            </main>

            {/* ── Chat sidebar ──────────────────────────────────────────────── */}
            {(showChat || isLoading) && (
                <StreamChat
                    hostUserId={host.id}
                    chatRoomArn={chatRoomArn}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}
