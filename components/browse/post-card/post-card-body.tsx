"use client";

import React from "react";
import { CreateIcon, BubbleIcon, RetweetIcon, HeartIcon, HeartFilledIcon, BookmarkIcon, BookmarkFilledIcon, BarsIcon, LinkIcon, VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { PostTickerPill } from "./post-ticker-pill";
import { MediaGrid } from "@/components/browse/media-grid";
import { AudioMessagePlayer } from "@/components/messages/audio-message-player";
import { FeedVideoPlayer } from "@/components/video/feed-video-player";
import { PollDisplay } from "@/components/browse/poll-display";
import { LinkPreviewCard } from "@/components/browse/link-preview-card";
import { PaywallGate } from "@/components/browse/paywall-gate";
import { ImageViewer } from "@/components/ui/image-viewer";
import { MoreHorizontal } from "lucide-react";
import { ActionButton } from "./action-button";
import { QuotedPostView } from "./quoted-post-view";
import type { PostCardPost } from "./post-card.types";
import { compactCount } from "@/lib/utils";

interface PostCardBodyProps {
    post: PostCardPost;
    imageUrl: string | null;
    showPaywall: boolean;
    hasValidImage: boolean;
    hasValidMedia: boolean;
    mediaError: boolean;
    isImageExpanded: boolean;
    liked: boolean;
    bookmarked: boolean;
    likeCount: number;
    reposts: number;
    views?: number;
    comments: number;
    setIsUnlocked: (val: boolean) => void;
    setMediaError: (val: boolean) => void;
    setIsImageExpanded: (val: boolean) => void;
    handleLike: (e: React.MouseEvent) => void;
    handleBookmark: (e: React.MouseEvent) => void;
    handleComment: (e: React.MouseEvent) => void;
}

export function PostCardBody({
    post,
    imageUrl,
    showPaywall,
    hasValidImage,
    hasValidMedia,
    mediaError,
    isImageExpanded,
    liked,
    bookmarked,
    likeCount,
    reposts,
    views,
    comments,
    setIsUnlocked,
    setMediaError,
    setIsImageExpanded,
    handleLike,
    handleBookmark,
    handleComment,
}: PostCardBodyProps) {
    const { content, videoUrl, isPaywalled, linkPreview, hasContentWarning, contentWarningText, quotedPost, user } = post;
    const displayCreatedAt = post.originalCreatedAt ?? post.createdAt;

    return (
        <>
            {/* Body text */}
            {content && (
                <div className="text-[15px] text-zinc-200 leading-normal mb-1 -mt-1.5 whitespace-pre-wrap break-words">
                    {content}
                </div>
            )}

            {/* Paywall */}
            {showPaywall && (
                <PaywallGate
                    postId={post.id}
                    paywallPrice={post.paywallPrice ?? 0}
                    authorWalletAddress={post.user.wallet_address ?? null}
                    onUnlocked={() => setIsUnlocked(true)}
                />
            )}

            {/* Poll */}
            {!showPaywall && <PollDisplay postId={post.id} />}

            {/* Link preview */}
            {!isPaywalled && linkPreview && (
                <div className="mb-3">
                    <LinkPreviewCard preview={linkPreview} />
                </div>
            )}

            {/* Video */}
            {!isPaywalled && videoUrl ? (
                <div className="my-1">
                    {/* rounded-2xl, matching the image grid and quoted post —
                        one radius across every kind of post media. */}
                    <FeedVideoPlayer postId={post.id} videoUrl={videoUrl} poster={imageUrl} autoplayInView className="rounded-2xl border border-white/10" />
                    {/* spacer keeps the content-warning/views row below the player */}
                    {(hasContentWarning || views !== undefined) && (
                        <div className="flex items-center justify-between mt-2.5 mx-3.5">
                            {hasContentWarning ? (
                                <span className="flex items-center text-xs font-semibold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full">
                                    <CreateIcon className="w-4 h-4" /> Content Warning{contentWarningText ? `: ${contentWarningText}` : ""}
                                </span>
                            ) : <span />}
                        </div>
                    )}
                </div>
            ) : !showPaywall && (hasValidImage || hasValidMedia) && !mediaError ? (
                <div className="mb-3">
                    {/* Voice notes render as a player, not a grid tile —
                        MediaGrid draws images. Reuses the messages player
                        rather than a second waveform implementation. */}
                    {post.media?.filter((m: { type: string; url: string }) => m.type === "audio").map((m: { type: string; url: string }) => (
                        <AudioMessagePlayer key={m.url} src={m.url} className="mb-2" />
                    ))}
                    <MediaGrid
                        media={(hasValidMedia && !mediaError) ? post.media!.filter((m): m is { type: "image" | "video"; url: string } => m.type !== "audio") : [{ type: "image", url: imageUrl! }]}
                        onImageClick={() => setIsImageExpanded(true)}
                        onImageError={() => setMediaError(true)}
                    />
                    {hasContentWarning && (
                        <div className="mt-2 ml-0.5">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full w-fit">
                                <CreateIcon className="w-3.5 h-3.5" /> Content Warning{contentWarningText ? `: ${contentWarningText}` : ""}
                            </span>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Quoted post */}
            {quotedPost && (
                <div className="mt-3 mb-1">
                    <QuotedPostView quotedPost={quotedPost} />
                </div>
            )}

            {/* Image viewer */}
            {imageUrl && !showPaywall && (
                <ImageViewer
                    imageUrl={imageUrl}
                    isOpen={isImageExpanded}
                    onClose={() => setIsImageExpanded(false)}
                    rightContent={
                        <div className="flex flex-col w-full h-full bg-black pointer-events-auto overflow-y-auto">
                            <div className="flex flex-col px-4 pt-4 pb-0">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                                            {user.avatar_url ? (
                                                <img src={user.avatar_url} alt={user.name || "User"} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 font-bold">{(user.name?.[0] || "U")}</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-zinc-100">{user.name || ""}</span>
                                                {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                                                {user.verifiedTier === "business" && <BusinessBadgeIcon className="w-4 h-4 shrink-0" />}
                                                {user.verifiedTier === "government" && <GovBadgeIcon className="w-4 h-4 shrink-0" />}
                                            </div>
                                            <span className="text-zinc-500 text-[15px]">@{user.username || "user"}</span>
                                        </div>
                                    </div>
                                    {/* Badge + dots, same as the card header and
                                        the post detail. The Gemini spark that sat
                                        inline with the name is gone. */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {post.ticker && (
                                            <PostTickerPill
                                                ticker={post.ticker}
                                                tokenStatus={post.tokenStatus}
                                                tokenImage={post.token_image}
                                                size="md"
                                            />
                                        )}
                                        <button className="text-zinc-500 hover:text-zinc-100 hover:bg-white/10 p-2 rounded-full transition-colors">
                                            <MoreHorizontal className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {content && (
                                    <div className="text-[17px] text-zinc-100 leading-normal mb-3 whitespace-pre-wrap break-words">
                                        {content}
                                    </div>
                                )}

                                <div className="flex items-center gap-1.5 text-[15px] text-zinc-500 mb-4 font-medium flex-wrap">
                                    <span>{displayCreatedAt ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(displayCreatedAt)) : "--:--"}</span>
                                    <span>·</span>
                                    <span>{displayCreatedAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(displayCreatedAt)) : "Unknown date"}</span>
                                    {/* The engagement bar IS the view count — the
                                        same mark the action row below uses — so the
                                        stat is the bar plus a shortened number
                                        rather than a raw figure and the word
                                        "Views". */}
                                    {views !== undefined && (
                                        <>
                                            <span>·</span>
                                            <span className="flex items-center gap-1.5 font-bold text-white">
                                                <BarsIcon className="h-4 w-4" />
                                                {compactCount(views)}
                                            </span>
                                        </>
                                    )}
                                </div>

                                <div className="border-y border-white/10 py-3 flex items-center justify-between w-full">
                                    <ActionButton icon={<BubbleIcon className="w-[20px] h-[20px]" />} count={comments} hoverColor="hover:text-bleu text-zinc-500" />
                                    <ActionButton icon={<RetweetIcon className="w-[20px] h-[20px]" />} count={reposts} hoverColor="hover:text-green-500 text-zinc-500" />
                                    <ActionButton icon={liked ? <HeartFilledIcon className="w-[20px] h-[20px]" /> : <HeartIcon className="w-[20px] h-[20px]" />} count={likeCount} hoverColor="hover:text-rose-500 text-zinc-500" onClick={handleLike} active={liked} activeColor="text-rose-500" />
                                    <ActionButton icon={bookmarked ? <BookmarkFilledIcon className="w-[20px] h-[20px]" /> : <BookmarkIcon className="w-[20px] h-[20px]" />} hoverColor="hover:text-bleu text-zinc-500" onClick={handleBookmark} active={bookmarked} activeColor="text-bleu" />
                                    <ActionButton icon={<LinkIcon className="w-[20px] h-[20px]" />} hoverColor="hover:text-bleu text-zinc-500" />
                                </div>

                                <div className="flex items-center gap-3 py-4 border-b border-white/10">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 overflow-hidden" />
                                    <div className="text-zinc-500 text-[15px] flex-1">Post your reply</div>
                                    <button className="bg-white/10 hover:bg-white/20 transition-colors text-white px-4 py-1.5 rounded-full font-bold text-sm">Reply</button>
                                </div>
                            </div>
                        </div>
                    }
                    bottomLeftContent={
                        <div className="flex items-center justify-between w-full max-w-[600px] mx-auto px-4">
                            <div className="flex items-center justify-between flex-1 pr-6 md:pr-12">
                                <ActionButton icon={<BubbleIcon className="w-[20px] h-[20px]" />} count={comments} hoverColor="text-zinc-200 hover:text-bleu" />
                                <ActionButton icon={<RetweetIcon className="w-[20px] h-[20px]" />} count={reposts} hoverColor="text-zinc-200 hover:text-green-500" />
                                <ActionButton icon={liked ? <HeartFilledIcon className="w-[20px] h-[20px]" /> : <HeartIcon className="w-[20px] h-[20px]" />} count={likeCount} hoverColor="text-zinc-200 hover:text-rose-500 hover:bg-rose-500/10" onClick={handleLike} active={liked} activeColor="text-rose-500" />
                                <ActionButton icon={<BarsIcon className="w-[20px] h-[20px]" />} count={views} hoverColor="text-zinc-200 hover:text-twitter2" />
                            </div>
                            <div className="flex items-center gap-1">
                                <ActionButton icon={bookmarked ? <BookmarkFilledIcon className="w-[20px] h-[20px]" /> : <BookmarkIcon className="w-[20px] h-[20px]" />} hoverColor="text-zinc-200 hover:text-bleu hover:bg-bleu/10" onClick={handleBookmark} active={bookmarked} activeColor="text-bleu" />
                                <button className="text-zinc-200 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors">
                                    <LinkIcon className="w-[20px] h-[20px]" />
                                </button>
                            </div>
                        </div>
                    }
                />
            )}
        </>
    );
}
