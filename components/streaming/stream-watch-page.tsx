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

interface StreamWatchPageProps {
    host: UserType;
}

export function StreamWatchPage({ host }: StreamWatchPageProps) {
    const [showChat, setShowChat] = useState(true);
    const pathname = usePathname();
    const { miniPlayerData, enterMiniPlayer, exitMiniPlayer } = useMiniPlayer();

    const { data: stream, isLoading } = trpc.stream.getByUserId.useQuery({ userId: host.id });

    // Safely extract stream fields
    const isLive = stream?.isLive ?? false;
    const streamTitle = stream?.title ?? null;
    const streamCategory = stream?.category ?? null;
    const viewerCount = stream?.viewerCount ?? 0;
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
        <div className="flex flex-col lg:flex-row gap-6 min-h-screen w-full max-w-[1400px] mx-auto px-4 pt-16 pb-4">
            {/* ── Main column ─────────────────────────────────────────────── */}
            <div className={cn("flex flex-col min-w-0", showChat ? "flex-1" : "w-full")}>
                {isMiniActive ? (
                    <button
                        onClick={exitMiniPlayer}
                        className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-black text-white"
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
                />
            </div>

            {/* ── Chat sidebar ──────────────────────────────────────────────── */}
            {(showChat || isLoading) && (
                <StreamChat
                    hostUserId={host.id}
                    isLive={isLive}
                    chatRoomArn={chatRoomArn}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}
