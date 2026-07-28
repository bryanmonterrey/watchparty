"use client";

import Link from "next/link";
import { UserType } from "@/db/schema/auth/user";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";

// Home-tab hero: live → "watch now" card into the Streams tab; offline with
// uploads → Twitch-style "check out a recent upload" banner; neither → null.

export function HomeHero({ user, onWatch }: { user: UserType; onWatch?: () => void }) {
    const { data: stream, isLoading: streamLoading } = trpc.stream.getByUserId.useQuery({ userId: user.id });
    const { data: latest, isLoading: videoLoading } = trpc.content.getVideosByUser.useQuery(
        { userId: user.id, limit: 1 },
        { enabled: !stream?.isLive },
    );

    if (streamLoading || (!stream?.isLive && videoLoading)) {
        return <div className="shimmer-skeleton h-40 rounded-[20px]" />;
    }

    if (stream?.isLive) {
        return (
            <div className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-panel p-6 ring-1 ring-panel sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-red-400">
                        <span className="size-2 animate-pulse rounded-full bg-red-500" />
                        Live now
                    </span>
                    <p className="truncate text-lg font-black tracking-tight text-white">
                        {stream.title || `${user.name} is live`}
                    </p>
                </div>
                <button
                    onClick={onWatch}
                    className="h-11 shrink-0 cursor-pointer rounded-full bg-white px-6 text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                >
                    Watch now
                </button>
            </div>
        );
    }

    const video = latest?.videos[0];
    if (!video) return null;

    return (
        <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] bg-panel p-6 ring-1 ring-panel sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-col gap-1.5">
                <span className="w-fit rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300">
                    Offline
                </span>
                <p className="text-lg font-black tracking-tight text-white">
                    Check out a recent upload
                </p>
                <p className="text-sm font-medium text-zinc-500">
                    {user.name} isn&apos;t live right now.
                </p>
            </div>
            <Link
                href={`/video/${video.id}`}
                className="group w-full shrink-0 sm:w-[280px]"
            >
                <Squircle asChild radius={16}>
                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                        {video.thumbnailUrl && (
                            <img
                                src={video.thumbnailUrl}
                                alt={video.title ?? "Latest upload"}
                                className="size-full object-cover"
                            />
                        )}
                    </div>
                </Squircle>
                <p className="mt-2 line-clamp-1 text-sm font-bold text-zinc-200 transition-colors group-hover:text-white">
                    {video.title}
                </p>
            </Link>
        </div>
    );
}
