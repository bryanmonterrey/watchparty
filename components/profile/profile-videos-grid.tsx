"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { formatRelativeTime } from "@/lib/date-utils";
import { compactCount } from "@/lib/utils";

// The Videos tab: this person's videos as a two-up grid of 16:9 tiles — the
// Home row's card, minus the author line (it is their profile; the author is
// the page). Same query as the Home row, more of it.
function formatDuration(seconds?: number | null) {
    if (!seconds || seconds <= 0) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function ProfileVideosGrid({ userId, username, isOwner }: { userId: string; username: string | null; isOwner: boolean }) {
    const { data, isLoading } = trpc.content.getVideosByUser.useQuery({ userId, limit: 48 });

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3">
                        <div className="aspect-video rounded-[20px] shimmer-skeleton" />
                        <div className="h-4 w-3/4 rounded-full shimmer-skeleton" />
                    </div>
                ))}
            </div>
        );
    }

    const videos = data?.videos ?? [];
    if (!videos.length) {
        return (
            <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
                <p className="text-lg font-bold text-white">No videos yet</p>
                <p className="mt-1 text-sm font-medium text-zinc-500">
                    {isOwner ? "Upload one from the create button." : "Nothing uploaded yet."}
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            {videos.map((v) => {
                const duration = formatDuration(v.duration);
                const href = `/${username ?? userId}/${v.id}`;
                return (
                    <Link key={v.id} href={href} className="group block">
                        <Squircle asChild radius={20}>
                            <div className="relative aspect-video overflow-hidden bg-zinc-900">
                                {v.thumbnailUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.thumbnailUrl} alt={v.title ?? "Video"} loading="lazy" className="size-full object-cover" />
                                )}
                                {duration && (
                                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                                        {duration}
                                    </span>
                                )}
                                <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-md">
                                    {compactCount(v.views ?? 0)} views
                                </span>
                            </div>
                        </Squircle>
                        <p className="mt-3 line-clamp-2 text-base font-bold leading-snug tracking-tight text-white/85 transition-colors group-hover:text-white">
                            {v.title}
                        </p>
                        {v.createdAt && (
                            <p className="mt-1 text-13 font-semibold text-zinc-500">{formatRelativeTime(String(v.createdAt))}</p>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}
