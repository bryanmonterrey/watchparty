"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { PostOptionsMenu } from "./post-options-menu";
import { PostTickerPill } from "./post-ticker-pill";
import { formatRelativeTime } from "@/lib/date-utils";
import { UserHoverCard } from "../user-hover-card";
import type { PostCardPost } from "./post-card.types";

interface PostCardHeaderRowProps {
    post: PostCardPost;
    isOwnPost: boolean;
    showReportDialog: boolean;
    setShowReportDialog: (val: boolean) => void;
    setIsHidden: (val: boolean) => void;
}

export function PostCardHeaderRow({
    post,
    isOwnPost,
    showReportDialog,
    setShowReportDialog,
    setIsHidden,
}: PostCardHeaderRowProps) {
    const router = useRouter();
    const { user, createdAt, originalCreatedAt, ticker, tokenStatus, token_image, isPinned } = post;
    const displayCreatedAt = originalCreatedAt ?? createdAt;

    return (
        <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0 leading-none">
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (user.username) router.push(`/${user.username}`);
                    }}
                    className="cursor-pointer flex items-center gap-1.5 min-w-0"
                >
                    <UserHoverCard userId={post.userId}>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-[15px] text-white2 truncate hover:underline">
                                {user.name || ""}
                            </span>
                            {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                            {user.verifiedTier === "business" && <BusinessBadgeIcon className="w-4 h-4 shrink-0" />}
                            {user.verifiedTier === "government" && <GovBadgeIcon className="w-4 h-4 shrink-0" />}
                            {user.affiliateIconUrl && (
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (user.affiliateUsername) router.push(`/${user.affiliateUsername}`);
                                    }}
                                    className="shrink-0 size-[15px] overflow-hidden rounded-[3px] bg-muted ring-1 ring-border/60 cursor-pointer"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={user.affiliateIconUrl}
                                        alt={user.affiliateUsername ? `Affiliated with @${user.affiliateUsername}` : "Affiliate"}
                                        className="size-full object-cover"
                                    />
                                </span>
                            )}
                            <span className="text-postgray truncate text-[15px]">@{user.username || "user"}</span>

                            {/* SERVER TAG — the community this user represents,
                                immediately right of the handle.
                                
                                Its own slot rather than reusing the affiliate
                                badge to its left: an affiliate is a creator this
                                person is tied to, a server tag is a community
                                they speak for. Same shape, different claim, and
                                a row that conflates them tells the reader the
                                wrong thing about both.

                                Renders only with data — no placeholder. */}
                            {user.serverTag && (
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (user.serverTagId) router.push(`/communities/${user.serverTagId}`);
                                    }}
                                    title={user.serverTag}
                                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 ring-1 ring-border/60 transition-colors hover:bg-white/[0.1]"
                                >
                                    {user.serverTagIconUrl && (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={user.serverTagIconUrl}
                                            alt=""
                                            className="size-3 shrink-0 rounded-[2px] object-cover"
                                        />
                                    )}
                                    {/* Truncated hard: a server tag is an
                                        abbreviation, and one long enough to
                                        squeeze the handle has stopped being a
                                        tag. */}
                                    <span className="max-w-[72px] truncate text-11 font-bold text-white2">
                                        {user.serverTag}
                                    </span>
                                </span>
                            )}
                        </div>
                    </UserHoverCard>
                </div>
                <span className="text-postgray text-[15px]">·</span>
                <span className="text-postgray text-[15px] whitespace-nowrap">
                    {displayCreatedAt ? formatRelativeTime(new Date(displayCreatedAt).toISOString()) : "Just now"}
                </span>
            </div>

            {/* Actions (ticker pill + Options). -mr-1.5 matches the bottom action
                bar's right inset so the More button aligns vertically above Share.
                The Gemini spark that used to sit here is gone; the pill took its
                slot, which is why the badge now reads against the dots rather
                than trailing the timestamp. */}
            <div className="flex items-center shrink-0 gap-1 -mr-1.5">
                {/* The coin badge. `sm` because the dots button beside it is
                    18px — see post-ticker-pill.tsx for the anatomy. */}
                {ticker && (
                    <PostTickerPill ticker={ticker} tokenStatus={tokenStatus} tokenImage={token_image} tokenId={post.tokenId} />
                )}
                <PostOptionsMenu
                    postId={post.id}
                    userId={post.userId}
                    username={user.username}
                    onClose={() => setShowReportDialog(false)}
                    onHide={() => setIsHidden(true)}
                    isOwnPost={isOwnPost}
                    isPinned={isPinned}
                    open={showReportDialog}
                    onOpenChange={setShowReportDialog}
                    triggerClassName={cn(
                        "text-postgray cursor-pointer hover:bg-twitter2/[12%] hover:text-white p-1.5 rounded-full transition-colors",
                        showReportDialog && "text-white"
                    )}
                    trigger={<MoreHorizontal className="w-[18px] h-[18px]" />}
                />
            </div>
        </div>
    );
}
