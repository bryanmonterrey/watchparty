"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
// formatRelativeTime, not date-fns' formatDistanceToNow: that renders
// "about 6 hours ago", where this gives "6h ago" — same information, a third
// of the width, and what home's header already shows.
import { formatRelativeTime } from "@/lib/date-utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { WatchHeader, WatchHeaderSkeleton } from "@/components/video/watch-header";
import { UserType } from "@/db/schema/auth/user";
import { CommentSection } from "@/components/browse/comment-section";
import { type InlineChipToken } from "@/components/tokens/token-inline-chip";
import { TokenAction } from "@/components/tokens/token-row";
import { ViewsStat } from "@/components/ui/views-stat";

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
    /** Server-resolved for the viewer, so the repost button is right on first paint. */
    isReposted?: boolean;
    /** Likewise for the dots menu's Save row. */
    isBookmarked?: boolean;
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
    isReposted = false,
    isBookmarked = false,
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
                {/* The header's own loading twin — see watch-header.tsx. This used
                    to be hand-rolled here and had drifted back to the pre-
                    WatchHeader layout (title stacked above the row, size-20
                    ringed avatar), which is why it didn't match the live page. */}
                <WatchHeaderSkeleton />

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
                // No ticker pill: the coin's action moved down to the stats
                // line, beside the view count.
                // Bottom right, where the meta row used to be inline: the count
                // and the age of the video.
                stats={
                    <>
                        {token && (
                            <>
                                <TokenAction token={token} postId={postId} size="lg" />
                                <span aria-hidden>·</span>
                            </>
                        )}
                        <ViewsStat views={views} />
                        <span aria-hidden>·</span>
                        <span>{formatRelativeTime(new Date(createdAt).toISOString())}</span>
                    </>
                }
                post={{ id: postId, liked, onLikeToggle: handleLike, reposted: isReposted, bookmarked: isBookmarked }}
                // Follow/Subscribe leads here, and no Gift Subs — gifting is a
                // channel act; this row is about the video.
                followFirst
                giftSubs={false}
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

            {/* Comments. The id stays a deep-link target (#comments) even though
                the header no longer has a button pointing at it. */}
            <div id="comments" className="pt-4">
                <p className="text-lg font-bold text-white mb-4">
                    {formatViewers(comments)} Comments
                </p>
                <CommentSection postId={postId} />
            </div>
        </div>
    );
}
