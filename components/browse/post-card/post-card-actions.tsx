"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { BubbleIcon, HeartIcon, HeartFilledIcon, BarsIcon, BookmarkIcon, BookmarkFilledIcon, LinkIcon } from "@/components/icons";
import { ActionButton } from "./action-button";
import { RepostMenu } from "./repost-menu";

import { ShareMenu } from "./share-menu";

interface PostCardActionsProps {
    post: any;
    comments: number;
    repostCount: number;
    reposted: boolean;
    showRepostMenu: boolean;
    setShowRepostMenu: (val: boolean) => void;
    likeCount: number;
    liked: boolean;
    views?: number;
    bookmarked: boolean;
    handleComment: (e: React.MouseEvent) => void;
    handleRepost: (e: React.MouseEvent) => void;
    doRepost: () => void;
    doQuote: () => void;
    handleLike: (e: React.MouseEvent) => void;
    handleBookmark: (e: React.MouseEvent) => void;
}

export function PostCardActions({
    post,
    comments,
    repostCount,
    reposted,
    showRepostMenu,
    setShowRepostMenu,
    likeCount,
    liked,
    views,
    bookmarked,
    handleComment,
    handleRepost,
    doRepost,
    doQuote,
    handleLike,
    handleBookmark,
}: PostCardActionsProps) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-22">
                <ActionButton
                    icon={<BubbleIcon className="w-[18px] h-[18px]"/>}
                    count={comments}
                    hoverColor="hover:text-twitter2"
                    onClick={handleComment}
                    active={false}
                    activeColor="text-twitter2"
                />
                <RepostMenu
                    open={showRepostMenu}
                    onOpenChange={setShowRepostMenu}
                    reposted={reposted}
                    repostCount={repostCount}
                    onRepostClick={handleRepost}
                    onDoRepost={doRepost}
                    onDoQuote={doQuote}
                />
                <ActionButton
                    icon={liked ? <HeartFilledIcon className="w-[18px] h-[18px]" /> : <HeartIcon className="w-[18px] h-[18px]" />}
                    count={likeCount}
                    hoverColor="hover:text-red1"
                    onClick={handleLike}
                    active={liked}
                    activeColor="text-red1"
                />
                <ActionButton
                    icon={<BarsIcon className="w-[18px] h-[18px]"/>}
                    count={views}
                    hoverColor="hover:text-twitter2"
                />
            </div>

            <div className="flex items-center gap-0.5">
                <button
                    onClick={handleBookmark}
                    className={cn(
                        "p-1.5 rounded-full cursor-pointer transition-colors hover:bg-twitter2/[12%]",
                        bookmarked ? "text-twitter2" : "text-postgray hover:text-white"
                    )}
                >
                    {bookmarked ? <BookmarkFilledIcon className="w-[18px] h-[18px]" /> : <BookmarkIcon className="w-[18px] h-[18px]" />}
                </button>
                <ShareMenu 
                    post={post}
                    bookmarked={bookmarked}
                    handleBookmark={handleBookmark}
                />
            </div>
        </div>
    );
}
