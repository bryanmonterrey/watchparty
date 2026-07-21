"use client";

import Link from "next/link";
import { UserType } from "@/db/schema/auth/user";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { formatRelativeTime } from "@/lib/date-utils";

// Horizontal "Recent videos" row for the channel Home tab (the Kick "Stream
// Videos" pattern). Hidden entirely when the user has no uploads.

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

    if (isLoading) {
        return (
            <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-[280px] shrink-0">
                        <div className="shimmer-skeleton aspect-video rounded-[16px]" />
                        <div className="shimmer-skeleton mt-2 h-3.5 w-3/4 rounded-full" />
                    </div>
                ))}
            </div>
        );
    }

    const videos = data?.videos ?? [];
    if (!videos.length) return null;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-black tracking-tight text-white">Recent videos</h3>
                <button
                    onClick={onViewAll}
                    className="cursor-pointer text-sm font-bold text-zinc-500 transition-colors hover:text-white"
                >
                    View all
                </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {videos.map((v) => {
                    const duration = formatDuration(v.duration);
                    return (
                        <Link
                            key={v.id}
                            href={`/${user.username ?? user.id}/${v.id}`}
                            className="group w-[280px] shrink-0"
                        >
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
                                        <span className="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white">
                                            {duration}
                                        </span>
                                    )}
                                </div>
                            </Squircle>
                            <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-zinc-200 transition-colors group-hover:text-white">
                                {v.title}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                                {formatViews(v.views ?? 0)} views · {v.createdAt ? formatRelativeTime(String(v.createdAt)) : ""}
                            </p>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
