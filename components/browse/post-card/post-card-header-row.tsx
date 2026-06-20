"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { GeminiIcon, VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { PostOptionsMenu } from "./post-options-menu";
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
    const { user, createdAt, originalCreatedAt, ticker, tokenStatus, isPinned } = post;
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
                                {user.name || "Unknown"}
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
                        </div>
                    </UserHoverCard>
                </div>
                <span className="text-postgray text-[15px]">·</span>
                <span className="text-postgray text-[15px] whitespace-nowrap">
                    {displayCreatedAt ? formatRelativeTime(new Date(displayCreatedAt).toISOString()) : "Just now"}
                </span>
                {ticker && (
                    <button className={cn(
                        "text-xs cursor-pointer font-black tracking-tighter px-2 py-1 rounded-full transition-colors active:scale-95",
                        tokenStatus === "live"
                            ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"
                            : "bg-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60"
                    )}>
                        ${ticker}
                    </button>
                )}
            </div>

            {/* Actions (Gemini + Options) */}
            <div className="flex items-center shrink-0 gap-0.5">
                <button className="text-postgray hover:bg-twitter2/[12%] cursor-pointer hover:text-zinc-100 p-1.5 rounded-full transition-colors">
                    <GeminiIcon className="w-[18px] h-[18px]" />
                </button>
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
                    trigger={
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                "text-postgray cursor-pointer hover:bg-twitter2/[12%] hover:text-white p-1.5 rounded-full transition-colors",
                                showReportDialog && "text-white"
                            )}
                        >
                            <MoreHorizontal className="w-[18px] h-[18px]" />
                        </button>
                    }
                />
            </div>
        </div>
    );
}
