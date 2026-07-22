"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { UserType } from "@/db/schema/auth/user";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/date-utils";

// Horizontal "Recent videos" rail for the channel Home tab, using the Twitch
// featured-clips anatomy: a leading header card inside the rail, thumbnails
// with overlay badges (duration / views / age), an avatar + title meta row
// with a kebab menu, and floating paging chevrons. Hidden when no uploads.

function formatViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function formatDuration(seconds: number | null): string | null {
    if (!seconds) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

export function HomeVideosRow({ user, onViewAll }: {
    user: UserType;
    onViewAll?: () => void;
}) {
    const { data, isLoading } = trpc.content.getVideosByUser.useQuery({ userId: user.id, limit: 12 });
    const reducedMotion = useReducedMotion();
    const railRef = useRef<HTMLDivElement>(null);
    const [canScroll, setCanScroll] = useState({ left: false, right: false });

    const updateScroll = useCallback(() => {
        const el = railRef.current;
        if (!el) return;
        setCanScroll({
            left: el.scrollLeft > 8,
            right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
        });
    }, []);

    const videos = data?.videos ?? [];

    useEffect(() => {
        updateScroll();
    }, [videos.length, updateScroll]);

    const page = (dir: 1 | -1) => {
        const el = railRef.current;
        if (!el) return;
        el.scrollBy({
            left: dir * el.clientWidth * 0.8,
            behavior: reducedMotion ? "auto" : "smooth",
        });
    };

    if (isLoading) {
        return (
            <div className="flex gap-4 overflow-hidden">
                <div className="shimmer-skeleton w-[180px] shrink-0 rounded-[20px]" />
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-[280px] shrink-0">
                        <div className="shimmer-skeleton aspect-video rounded-[16px]" />
                        <div className="mt-3 flex items-center gap-2.5">
                            <div className="shimmer-skeleton size-9 shrink-0 rounded-full" />
                            <div className="shimmer-skeleton h-3.5 w-3/4 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!videos.length) return null;

    return (
        <div className="relative">
            <div
                ref={railRef}
                onScroll={updateScroll}
                className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <Squircle asChild radius={20}>
                    <div className="flex w-[180px] shrink-0 flex-col items-start justify-between gap-6 bg-pastelred p-5">
                        <h3 className="font-pixel text-2xl leading-tight text-white">
                            Recent videos
                        </h3>
                        <button
                            onClick={onViewAll}
                            className="h-11 shrink-0 cursor-pointer rounded-full bg-white px-5 text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                        >
                            Show all
                        </button>
                    </div>
                </Squircle>
                {videos.map((v) => {
                    const duration = formatDuration(v.duration);
                    const href = `/${user.username ?? user.id}/${v.id}`;
                    return (
                        <div key={v.id} className="group w-[280px] shrink-0">
                            <Link href={href} className="block">
                                <Squircle asChild radius={16}>
                                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                                        {v.thumbnailUrl && (
                                            <img
                                                src={v.thumbnailUrl}
                                                alt={v.title ?? "Video"}
                                                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                                            />
                                        )}
                                        {duration && (
                                            <span className="absolute left-2 top-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white">
                                                {duration}
                                            </span>
                                        )}
                                        <span className="absolute bottom-2 left-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white">
                                            {formatViews(v.views ?? 0)} views
                                        </span>
                                        {v.createdAt && (
                                            <span className="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white">
                                                {formatRelativeTime(String(v.createdAt))}
                                            </span>
                                        )}
                                    </div>
                                </Squircle>
                            </Link>
                            <div className="mt-3 flex items-start gap-2.5">
                                <Avatar className="size-9 shrink-0">
                                    <AvatarImage src={v.author.avatar_url ?? undefined} />
                                    <AvatarFallback className="bg-zinc-800" />
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <Link href={href}>
                                        <p className="line-clamp-1 text-sm font-bold leading-snug text-zinc-200 transition-colors group-hover:text-white">
                                            {v.title}
                                        </p>
                                    </Link>
                                    <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-zinc-500">
                                        <span className="truncate">{v.author.name ?? v.author.username}</span>
                                        {v.author.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-3.5 shrink-0" />}
                                        {v.author.verifiedTier === "business" && <BusinessBadgeIcon className="size-3.5 shrink-0" />}
                                        {v.author.verifiedTier === "government" && <GovBadgeIcon className="size-3.5 shrink-0" />}
                                    </span>
                                </div>
                                <GooDropdown
                                    stopPropagation
                                    width={180}
                                    align="end"
                                    triggerAriaLabel="Video options"
                                    triggerClassName="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                                    trigger={<HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />}
                                    items={[
                                        { label: "Watch video", href },
                                        {
                                            label: "Copy link",
                                            onClick: () => {
                                                void navigator.clipboard.writeText(`${window.location.origin}${href}`);
                                            },
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            {canScroll.left && (
                <button
                    onClick={() => page(-1)}
                    aria-label="Scroll back"
                    className="absolute -left-3 top-1/2 z-10 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:bg-zinc-100 active:scale-[0.95] sm:flex"
                >
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
                </button>
            )}
            {canScroll.right && (
                <button
                    onClick={() => page(1)}
                    aria-label="Scroll forward"
                    className="absolute -right-3 top-1/2 z-10 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all hover:bg-zinc-100 active:scale-[0.95] sm:flex"
                >
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
                </button>
            )}
        </div>
    );
}
