"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Link2Icon, BookmarkIcon, RestingDotsIcon, ThumbsDownIcon, HeartIcon, HeartFilledIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";
import { authClient } from "@/lib/auth/client";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileAvatar } from "@/components/video/profile-avatar";
import { UserType } from "@/db/schema/auth/user";

interface VideoAuthor {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    verifiedTier: string | null;
    followerCount: number;
}

interface VideoMetadataProps {
    postId: string;
    title: string | null;
    content: string | null;
    views: number;
    likes: number;
    comments: number;
    createdAt: Date;
    category: string | null;
    isLiked: boolean;
    author: VideoAuthor;
    isLoading?: boolean;
}

function formatViewers(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

export function VideoMetadata({
    postId,
    title,
    content,
    views,
    likes,
    comments,
    createdAt,
    category,
    isLiked: initialLiked,
    author,
    isLoading,
}: VideoMetadataProps) {
    const { data: session } = authClient.useSession();
    const [liked, setLiked] = useState(initialLiked);
    const [likeCount, setLikeCount] = useState(likes);
    const [descExpanded, setDescExpanded] = useState(false);

    const toggleLike = trpc.content.toggleLike.useMutation();

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 mt-3">
                {/* Title */}
                <div className="shimmer-skeleton h-6 w-2/3 rounded-full" />

                {/* Creator + Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-4">
                        <div className="shimmer-skeleton size-20 rounded-full shrink-0 border-[6px] border-black" />
                        <div className="flex flex-col gap-2">
                            <div className="shimmer-skeleton h-6 w-36 rounded-full" />
                            <div className="shimmer-skeleton h-5 w-24 rounded-full opacity-60" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="shimmer-skeleton h-9 w-96 rounded-full" />
                    </div>
                </div>

                {/* Description Block */}
                <div className="shimmer-skeleton h-24 w-full rounded-xl mt-1" />

                {/* Comments heading */}
                <div className="pt-4">
                    <div className="shimmer-skeleton h-5 w-32 rounded-full" />
                </div>
            </div>
        );
    }

    const handleLike = () => {
        if (!session) return;
        setLiked(v => !v);
        setLikeCount(v => liked ? v - 1 : v + 1);
        toggleLike.mutate({ postId, contentType: "video" });
    };

    const descLines = (content ?? "").split("\n");
    const shortDesc = descLines.slice(0, 3).join("\n");
    const hasMore = descLines.length > 3 || (content ?? "").length > 200;

    return (
        <div className="flex flex-col gap-2 mt-2">
            {/* Title */}
            <h1 className="text-[20px] font-bold text-white leading-snug line-clamp-2">
                {title ?? "Untitled"}
            </h1>

            {/* Creator + Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                {/* Left: Compact Profile Header */}
                <div className="flex flex-row items-center gap-4">
                    <ProfileAvatar user={author as unknown as UserType} isMinimized={true} />
                    <ProfileHeader user={author as unknown as UserType} isMinimized={true} />
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white/10 hover:bg-white/15 transition-colors rounded-full overflow-hidden">
                        <button
                            onClick={handleLike}
                            className={cn(
                                "cursor-pointer flex items-center gap-2 px-5 py-2.5 text-md font-semibold transition-colors hover:bg-white/5",
                                liked ? "text-red1" : "text-zinc-100"
                            )}
                        >
                            {liked
                                ? <HeartFilledIcon className="size-5" />
                                : <HeartIcon className="size-5" />
                            }
                            {likeCount > 0 ? formatViewers(likeCount) : "Like"}
                        </button>
                    </div>

                    <button className="cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-full text-md font-semibold bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <Link2Icon className="size-5" />
                        Share
                    </button>
                    <button className="cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-full text-md font-semibold bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <BookmarkIcon className="size-5" />
                        Save
                    </button>
                    <button className="cursor-pointer p-2.5 rounded-full bg-white/10 text-zinc-100 hover:bg-white/15 transition-colors">
                        <RestingDotsIcon className="size-5" />
                    </button>
                </div>
            </div>

            {/* Description Block */}
            <div
                className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 mt-1 cursor-pointer"
                onClick={() => setDescExpanded(v => !v)}
            >
                <div className="flex gap-2 items-center mb-1">
                    <p className="text-sm font-bold text-zinc-200">
                        {formatViewers(views)} views
                    </p>
                    <p className="text-sm font-bold text-zinc-200">
                        {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                    </p>
                    {category && (
                        <span className="text-sm font-bold text-lantern ml-1">
                            #{category.replace(/\s+/g, "")}
                        </span>
                    )}
                </div>
                <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed font-medium">
                    {descExpanded ? content : shortDesc}
                    {!descExpanded && hasMore && "..."}
                </p>
                {hasMore && (
                    <span className="text-sm font-bold text-zinc-300 mt-2 block">
                        {descExpanded ? "Show less" : "Show more"}
                    </span>
                )}
            </div>

            {/* Comments */}
            <div className="pt-4">
                <p className="text-lg font-bold text-white mb-4">
                    {formatViewers(comments)} Comments
                </p>
                <div className="text-center py-12 text-zinc-500 font-medium text-sm">
                    Comments coming soon
                </div>
            </div>
        </div>
    );
}
