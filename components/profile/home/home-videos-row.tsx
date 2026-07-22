"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
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

    // Bleed to the true content-area edges: the profile root is a size
    // container, so 100cqw is the full width beside the sidebar. Gutter =
    // the centered 1400px container's auto margin + its 2rem padding.

    if (isLoading) {
        return (
            <div className="mx-[calc((max((100cqw_-_1400px)/2,0px)_+_2rem)*-1)] flex gap-5 overflow-hidden px-[calc(max((100cqw_-_1400px)/2,0px)_+_2rem)]">
                <div className="shimmer-skeleton w-[150px] shrink-0 rounded-[20px]" />
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-[300px] shrink-0 sm:w-[360px]">
                        <div className="shimmer-skeleton aspect-video rounded-[20px]" />
                        <div className="mt-3.5 flex items-center gap-3">
                            <div className="shimmer-skeleton size-10 shrink-0 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-3/4 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!videos.length) return null;

    return (
        <div className="group/vrail relative mx-[calc((max((100cqw_-_1400px)/2,0px)_+_2rem)*-1)]">
            <div
                ref={railRef}
                onScroll={updateScroll}
                className="flex gap-5 overflow-x-auto px-[calc(max((100cqw_-_1400px)/2,0px)_+_2rem)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <Squircle asChild radius={20}>
                    <div className="flex min-h-[280px] w-[135px] shrink-0 flex-col items-start justify-between gap-8 bg-pastelred p-5 sm:min-h-[300px] sm:w-[150px]">
                        <h3 className="font-pixel text-2xl leading-[1.15] text-white">
                            Recent videos
                        </h3>
                        <button
                            onClick={onViewAll}
                            className="h-11 shrink-0 cursor-pointer rounded-full bg-white px-4 text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                        >
                            Show all
                        </button>
                    </div>
                </Squircle>
                {videos.map((v) => {
                    const duration = formatDuration(v.duration);
                    const href = `/${user.username ?? user.id}/${v.id}`;
                    return (
                        <div key={v.id} className="group w-[300px] shrink-0 sm:w-[360px]">
                            <Link href={href} className="block">
                                <Squircle asChild radius={20}>
                                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                                        {v.thumbnailUrl && (
                                            <img
                                                src={v.thumbnailUrl}
                                                alt={v.title ?? "Video"}
                                                className="size-full object-cover"
                                            />
                                        )}
                                        {duration && (
                                            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                                                {duration}
                                            </span>
                                        )}
                                        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                                            {formatViews(v.views ?? 0)} views
                                        </span>
                                        {v.createdAt && (
                                            <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                                                {formatRelativeTime(String(v.createdAt))}
                                            </span>
                                        )}
                                    </div>
                                </Squircle>
                            </Link>
                            <div className="mt-3.5 flex items-start gap-3">
                                <Avatar className="size-10 shrink-0">
                                    <AvatarImage src={v.author.avatar_url ?? undefined} />
                                    <AvatarFallback className="bg-zinc-800" />
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <Link href={href}>
                                        <p className="line-clamp-1 text-base font-bold leading-snug tracking-tight text-white transition-colors group-hover:text-zinc-300">
                                            {v.title}
                                        </p>
                                    </Link>
                                    <span className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-zinc-400">
                                        <span className="truncate">{v.author.name ?? v.author.username}</span>
                                        {v.author.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-4 shrink-0" />}
                                        {v.author.verifiedTier === "business" && <BusinessBadgeIcon className="size-4 shrink-0" />}
                                        {v.author.verifiedTier === "government" && <GovBadgeIcon className="size-4 shrink-0" />}
                                    </span>
                                </div>
                                <GooDropdown
                                    stopPropagation
                                    width={180}
                                    align="end"
                                    triggerAriaLabel="Video options"
                                    triggerClassName="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                                    trigger={<HugeiconsIcon icon={MoreVerticalIcon} className="size-6" strokeWidth={3} />}
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
            {/* Edge arrows matching the homepage trending carousel: full-height
                flat blurred bars that fade in on rail hover. */}
            {canScroll.left && (
                <button
                    type="button"
                    onClick={() => page(-1)}
                    aria-label="Scroll left"
                    className="group/arrow absolute inset-y-0 left-0 z-20 hidden w-16 cursor-pointer items-center justify-start bg-black/50 pl-2 opacity-0 backdrop-blur-xs transition-opacity duration-300 group-hover/vrail:opacity-100 sm:flex"
                >
                    <ChevronLeft className="size-8 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110" strokeWidth={2.5} />
                </button>
            )}
            {canScroll.right && (
                <button
                    type="button"
                    onClick={() => page(1)}
                    aria-label="Scroll right"
                    className="group/arrow absolute inset-y-0 right-0 z-20 hidden w-16 cursor-pointer items-center justify-end bg-black/50 pr-2 opacity-0 backdrop-blur-xs transition-opacity duration-300 group-hover/vrail:opacity-100 sm:flex"
                >
                    <ChevronRight className="size-8 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110" strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
}
