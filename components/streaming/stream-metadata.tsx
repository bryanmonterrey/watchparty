"use client";

import { UserType } from "@/db/schema/auth/user";
import { formatDistanceToNow } from "date-fns";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Link2Icon, NotificationsIcon, RestingDotsIcon, BookmarkIcon, ThumbsDownIcon } from "../icons";

interface StreamMetadataProps {
    host: UserType;
    isLive: boolean;
    streamTitle: string | null;
    streamCategory: string | null;
    viewerCount: number;
    startedAt: Date;
    description: string | null;
    isLoading?: boolean;
}

function formatViewers(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

export function StreamMetadata({
    host,
    isLive,
    streamTitle,
    streamCategory,
    viewerCount,
    startedAt,
    description,
    isLoading
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
            {/* Title */}
            <h1 className="text-[20px] font-bold text-white leading-snug line-clamp-2">
                {streamTitle ?? `${host.name} is live`}
            </h1>

            {/* Creator + Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                {/* Left: Compact Profile Header */}
                <div className="flex flex-row items-center gap-4">
                    <ProfileAvatar user={host} isMinimized={true} />
                    <ProfileHeader user={host} isMinimized={true} />
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white/10 hover:bg-white/15 transition-colors rounded-full overflow-hidden">
                        <button className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/5">
                            <NotificationsIcon className="w-[18px] h-[18px]" />
                            Like
                        </button>
                        <div className="w-px h-5 bg-white/20" />
                        <button className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/5">
                            <ThumbsDownIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                    
                    <button className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <Link2Icon className="w-[18px] h-[18px]" />
                        Share
                    </button>
                    <button className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <BookmarkIcon className="w-[18px] h-[18px]" />
                        Save
                    </button>
                    <button className="p-2 rounded-full bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <RestingDotsIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>

            {/* Description Block */}
            <div className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 mt-1">
                <div className="flex gap-2 items-center mb-1">
                    {isLive && (
                        <p className="text-sm font-bold text-zinc-200">
                            {formatViewers(viewerCount)} watching now
                        </p>
                    )}
                    <p className="text-sm font-bold text-zinc-200">
                        Started streaming {formatDistanceToNow(startedAt, { addSuffix: true })}
                    </p>
                    {streamCategory && (
                        <span className="text-sm font-bold text-lantern ml-1">
                            #{streamCategory.replace(/\s+/g, '')}
                        </span>
                    )}
                </div>
                <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed font-medium">
                    {description || "Welcome to the stream!"}
                </p>
            </div>
        </div>
    );
}
