"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
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
                {/* ── TICKER PILL ──────────────────────────────────────────────
                    Anatomy borrowed from TokenInlineChip (components/tokens/
                    token-inline-chip.tsx): image on the left, $TICKER on the
                    right, both inside one rounded-full. Scaled down for the
                    header row — that chip is h-9, which would out-measure the
                    18px dots button next to it; h-7 with a size-5 mark keeps the
                    two the same optical height.

                    pl-1 pr-2.5: the image sits nearly flush with the pill's left
                    edge while the text keeps a normal inset, so the mark reads as
                    part of the pill instead of a circle with a gap around it.

                    Colour still carries token status — emerald once live, muted
                    zinc while it's a draft.

                    No image is a plain tinted disc, NOT a letter fallback. */}
                {ticker && (
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pl-1 pr-2.5 transition-colors active:scale-95",
                            tokenStatus === "live"
                                ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"
                                : "bg-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60",
                        )}
                    >
                        {token_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={token_image}
                                alt=""
                                className="size-5 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <span
                                className={cn(
                                    "size-5 shrink-0 rounded-full",
                                    tokenStatus === "live" ? "bg-emerald-500/30" : "bg-zinc-600/50",
                                )}
                            />
                        )}
                        <span className="text-xs font-black tracking-tighter">${ticker}</span>
                    </button>
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
