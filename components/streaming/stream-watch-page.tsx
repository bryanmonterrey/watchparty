"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { UserType } from "@/db/schema/auth/user";

import { StreamPlayer } from "./stream-player";
import { StreamChat } from "./stream-chat";
import { StreamMetadata } from "./stream-metadata";

interface StreamWatchPageProps {
    host: UserType;
}

export function StreamWatchPage({ host }: StreamWatchPageProps) {
    const [showChat, setShowChat] = useState(true);

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

    return (
        <div className="flex flex-col lg:flex-row gap-6 min-h-screen w-full max-w-[1400px] mx-auto px-4 pt-16 pb-4">
            {/* ── Main column ─────────────────────────────────────────────── */}
            <div className={cn("flex flex-col min-w-0", showChat ? "flex-1" : "w-full")}>
                <StreamPlayer
                    playbackUrl={playbackUrl}
                    isLive={isLive}
                    host={host}
                    showChat={showChat}
                    onToggleChat={() => setShowChat(v => !v)}
                    isLoading={isLoading}
                />
                
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
