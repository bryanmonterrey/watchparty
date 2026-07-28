"use client";

import { useEffect, useState } from "react";
import { UserType } from "@/db/schema/auth/user";
import { WatchHeader } from "@/components/video/watch-header";

interface StreamMetadataProps {
    host: UserType;
    isLive: boolean;
    streamTitle: string | null;
    streamCategory: string | null;
    viewerCount: number;
    startedAt: Date;
    description: string | null;
    isLoading?: boolean;
    /** Switches back to the host's profile — the stream and the profile are two
     *  views of the same page, and the display name is the control. */
    onNameClick?: () => void;
}

function formatViewers(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

/** Live viewer pill: pulsing pastelred dot + count, tabular so it never jitters. */
function ViewerChip({ count }: { count: number }) {
    return (
        <span className="flex h-7 items-center gap-1.5 rounded-full bg-pastelred/10 px-2.5 text-xs font-bold text-pastelred tabular-nums">
            <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pastelred opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-pastelred" />
            </span>
            {formatViewers(count)} watching
        </span>
    );
}

/** Elapsed stream time, ticking every second — h:mm:ss past the first hour. */
function DurationChip({ startedAt }: { startedAt: Date }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const s = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const label = h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
    return (
        <span className="flex h-7 items-center rounded-full bg-white/5 px-2.5 text-xs font-bold text-zinc-300 tabular-nums ring-1 ring-white/10">
            {label}
        </span>
    );
}

// NO token row here, deliberately. A stream has no coin of its own — there's no
// relation from `streams` to `tokens` — so the only thing to show was
// trade.tokenByCreator: the creator's most recent coin, which belongs to some
// unrelated video. (Checked the data: 0 of 50 token rows store an avatar, so the
// pill wasn't rendering an avatar as such; it was rendering a stranger video's
// art, which is why it looked arbitrary.) It only started appearing at all when
// tokenByCreator was relaxed to include drafts earlier today — 48 of 50 tokens
// are drafts, so before that it returned null here and the row never rendered.
//
// The row comes back when a stream has a coin to point at, i.e. when streams get
// their own post-card. StreamChat still pins the host's live token above chat —
// that one is deliberate (design brief §2) and is a channel affordance, not a
// claim about this stream.
export function StreamMetadata({
    host,
    isLive,
    streamTitle,
    streamCategory,
    viewerCount,
    startedAt,
    description,
    isLoading,
    onNameClick,
}: StreamMetadataProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 mt-3">
                {/* Title Skeleton */}
                <div className="shimmer-skeleton h-6 w-3/4 rounded-full" />

                {/* Creator + Actions Row Skeleton */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-4">
                        <div className="shimmer-skeleton w-24 h-24 rounded-full shrink-0 border-[6px] border-black" />
                        <div className="flex flex-col gap-2">
                            <div className="shimmer-skeleton h-6 w-36 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-24 rounded-full opacity-60" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="shimmer-skeleton h-9 w-24 rounded-full" />
                        <div className="shimmer-skeleton h-9 w-28 rounded-full" />
                        <div className="shimmer-skeleton h-9 w-9 rounded-full" />
                    </div>
                </div>

                {/* Description Block Skeleton */}
                <div className="shimmer-skeleton h-24 w-full rounded-xl mt-1" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 mt-3">
            <WatchHeader
                user={host}
                title={streamTitle ?? `${host.name} is live`}
                // The switch back to the profile. It was on the display name,
                // which this header no longer shows — @username is the identity
                // here, and clicking it means the same thing.
                onNameClick={onNameClick}
                nameTitle="Switch to profile"
                // Bottom right, where the video page puts its view count.
                stats={
                    isLive ? (
                        <>
                            <ViewerChip count={viewerCount} />
                            <DurationChip startedAt={startedAt} />
                        </>
                    ) : undefined
                }
            />

            {/* Description Block */}
            <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 mt-1">
                {streamCategory && (
                    <div className="flex gap-2 items-center mb-1">
                        <span className="text-sm font-bold text-lantern">
                            #{streamCategory.replace(/\s+/g, '')}
                        </span>
                    </div>
                )}
                <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed font-medium">
                    {description || "Welcome to the stream!"}
                </p>
            </div>
        </div>
    );
}
