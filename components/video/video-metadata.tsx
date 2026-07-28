"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { WatchHeader } from "@/components/video/watch-header";
import { UserType } from "@/db/schema/auth/user";
import { CommentSection } from "@/components/browse/comment-section";
import { type InlineChipToken } from "@/components/tokens/token-inline-chip";
import { TokenRow } from "@/components/tokens/token-row";

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
    /** Attached live token, when the video has one (design brief §2). */
    token?: InlineChipToken | null;
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
    token,
    isLoading,
}: VideoMetadataProps) {
    const { data: session } = useAuthSession();
    const [liked, setLiked] = useState(initialLiked);
    const [likeCount, setLikeCount] = useState(likes);
    const [descExpanded, setDescExpanded] = useState(false);

    const toggleLike = trpc.content.toggleLike.useMutation();

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 mt-2">
                {/* Title (text-[20px], up to 2 lines) */}
                <div className="shimmer-skeleton h-6 w-2/3 rounded-full" />

                {/* Creator + Actions Row — mirrors avatar (size-20) + name/username
                    + badge strip on the left, Like/Share/Save/menu pills on the right */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-4">
                        <div className="shimmer-skeleton size-20 rounded-full shrink-0 border-[6px] border-black" />
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <div className="shimmer-skeleton h-6 w-36 rounded-full" />
                                <div className="shimmer-skeleton h-11 w-24 rounded-full" />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="shimmer-skeleton h-4 w-24 rounded-full opacity-60" />
                                <div className="shimmer-skeleton h-4 w-28 rounded-full opacity-40" />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="shimmer-skeleton h-11 w-28 rounded-full" />
                        <div className="shimmer-skeleton h-11 w-28 rounded-full" />
                        <div className="shimmer-skeleton h-11 w-26 rounded-full" />
                        <div className="shimmer-skeleton size-11 rounded-full" />
                    </div>
                </div>

                {/* Description Block — meta line + two text lines in the box */}
                <div className="mt-1 flex flex-col gap-2 rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                        <div className="shimmer-skeleton h-4 w-20 rounded-full" />
                        <div className="shimmer-skeleton h-4 w-24 rounded-full opacity-60" />
                        <div className="shimmer-skeleton h-4 w-16 rounded-full opacity-40" />
                    </div>
                    <div className="shimmer-skeleton h-3.5 w-full rounded-full opacity-60" />
                    <div className="shimmer-skeleton h-3.5 w-4/5 rounded-full opacity-40" />
                </div>

                {/* Comments — heading, composer (avatar + input pill), then rows */}
                <div className="flex flex-col gap-4 pt-4">
                    <div className="shimmer-skeleton h-5 w-36 rounded-full" />
                    <div className="flex items-center gap-3">
                        <div className="shimmer-skeleton size-9 shrink-0 rounded-full" />
                        <div className="shimmer-skeleton h-10 flex-1 rounded-full opacity-60" />
                    </div>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex gap-3">
                            <div className="shimmer-skeleton size-9 shrink-0 rounded-full" />
                            <div className="flex flex-1 flex-col gap-1.5 pt-1">
                                <div className="shimmer-skeleton h-3.5 w-32 rounded-full" />
                                <div className={cn(
                                    "shimmer-skeleton h-3.5 rounded-full opacity-60",
                                    i === 0 ? "w-11/12" : i === 1 ? "w-3/4" : "w-1/2",
                                )} />
                            </div>
                        </div>
                    ))}
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
            <WatchHeader
                user={author as unknown as UserType}
                title={title ?? "Untitled"}
                tokenRow={token ? <TokenRow token={token} postId={postId} /> : undefined}
                // Bottom right, where the meta row used to be inline: the count
                // and the age of the video.
                stats={
                    <>
                        <span className="tabular-nums">{formatViewers(views)} views</span>
                        <span aria-hidden>·</span>
                        <span>{formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
                    </>
                }
                like={{ liked, onToggle: handleLike }}
            />

            {/* Description Block */}
            <div
                className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 mt-1 cursor-pointer"
                onClick={() => setDescExpanded(v => !v)}
            >
                {/* Views and age moved to the header's bottom right, so this row
                    is just the category now. */}
                {category && (
                    <div className="flex gap-2 items-center mb-1">
                        <span className="text-sm font-bold text-lantern">
                            #{category.replace(/\s+/g, "")}
                        </span>
                    </div>
                )}
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
                <CommentSection postId={postId} />
            </div>
        </div>
    );
}
