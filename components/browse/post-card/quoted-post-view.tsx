"use client";

import React from "react";
import { Users, BadgeCheck, Medal, Crown, MoreHorizontal } from "lucide-react";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, GlobeIcon, BubbleIcon, RetweetIcon, HeartIcon, BookmarkIcon, LinkIcon } from "@/components/icons";
import { MediaGrid } from "@/components/browse/media-grid";
import { ActionButton } from "./action-button";
import { ImageViewer } from "@/components/ui/image-viewer";
import { formatRelativeTime } from "@/lib/date-utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PostCardPost } from "./post-card.types";

type QuotedPost = NonNullable<PostCardPost["quotedPost"]>;


export function QuotedPostView({ quotedPost }: { quotedPost: QuotedPost }) {
    const router = useRouter();
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState("");
    const { id, user, content, createdAt, imageUrl, media, videoUrl, ticker, audience, replyPrivacy, hasContentWarning, contentWarningText } = quotedPost;

    const rawImageUrl = imageUrl;
    const hasValidImage = !!(rawImageUrl && typeof rawImageUrl === "string" && rawImageUrl.trim().length > 0 && (rawImageUrl.startsWith("http") || rawImageUrl.startsWith("/")));
    const hasValidMedia = !!(media && media.length > 0 && media.some(m => m.url && m.url.startsWith("http") && m.url.length > 12));

    return (
        <div 
            onClick={(e) => {
                e.stopPropagation();
                router.push(`/status/${id}`);
            }}
            className="border border-flexborder rounded-2xl p-3 bg-white2/[0.05] transition-colors overflow-hidden cursor-pointer"
        >
            {/* Header */}
            <div className="flex items-center gap-1.5 mb-1.5 leading-none">
                <div className="w-5 h-5 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                    {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name || "User"} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 text-[10px] font-bold">
                            {(user.name?.[0] || "U")}
                        </div>
                    )}
                </div>
                <span className="font-bold text-[14px] text-zinc-100 truncate">{user.name || ""}</span>
                {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                {user.verifiedTier === "business" && <BusinessBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                {user.verifiedTier === "government" && <GovBadgeIcon className="w-3.5 h-3.5 shrink-0" />}
                <span className="text-zinc-500 truncate text-[14px]">@{user.username || "user"}</span>
                <span className="text-zinc-500 text-[14px]">·</span>
                <span className="text-zinc-500 text-[14px] whitespace-nowrap">
                    {createdAt ? formatRelativeTime(new Date(createdAt).toISOString()) : "Just now"}
                </span>
                {ticker && (
                    <span className="text-[10px] font-black tracking-tighter px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                        ${ticker}
                    </span>
                )}
            </div>

            {/* Content */}
            {content && (
                <div className="text-[14px] text-zinc-200 leading-normal mb-2 line-clamp-3 whitespace-pre-wrap break-words">
                    {content}
                </div>
            )}

            {/* Media */}
            {videoUrl ? (
                <div className="rounded-xl overflow-hidden bg-zinc-900/50 h-fit">
                    <video src={videoUrl} className="w-full h-full object-cover" />
                </div>
            ) : (hasValidImage || hasValidMedia) ? (
                <div className="h-fit overflow-hidden">
                    <MediaGrid
                        media={hasValidMedia ? media!.filter((m): m is { type: "image" | "video"; url: string } => m.type !== "audio") : [{ type: "image", url: rawImageUrl! }]}
                        onImageClick={(index) => {
                            const urls = hasValidMedia ? media!.map(m => m.url) : [rawImageUrl!];
                            setViewerImage(urls[index] || "");
                            setViewerOpen(true);
                        }}
                    />
                </div>
            ) : null}

            {hasContentWarning && (
                <div className="mt-2 text-[11px] font-semibold text-amber-400/80 uppercase tracking-tight">
                    Contains Content Warning
                </div>
            )}

            {(audience && audience !== "everyone") || (replyPrivacy && replyPrivacy !== "everyone") ? (
                <div className="mt-2.5 flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {audience && audience !== "everyone" && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] font-medium text-twitter2">
                            {audience === "followers" && <><Users className="w-3.5 h-3.5" /> Followers</>}
                            {audience === "verified" && <><BadgeCheck className="w-3.5 h-3.5" /> Verified</>}
                            {audience === "token_holders" && <><Medal className="w-3.5 h-3.5" /> Coin Holders</>}
                            {audience === "vip" && <><Crown className="w-3.5 h-3.5" /> VIP Only</>}
                        </div>
                    )}
                    {replyPrivacy && replyPrivacy !== "everyone" && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] font-medium text-twitter2">
                            {replyPrivacy === "followers" && <><Users className="w-3.5 h-3.5" /> Following</>}
                            {replyPrivacy === "verified" && <><BadgeCheck className="w-3.5 h-3.5" /> Verified</>}
                            {replyPrivacy === "token_holders" && <><Medal className="w-3.5 h-3.5" /> Coin Holders</>}
                        </div>
                    )}
                </div>
            ) : null}

            <ImageViewer
                imageUrl={viewerImage}
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
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
                                        </div>
                                        <span className="text-zinc-500 text-[15px]">@{user.username || "user"}</span>
                                    </div>
                                </div>
                                <button className="text-zinc-500 hover:text-zinc-100 hover:bg-white/10 p-2 rounded-full transition-colors">
                                    <MoreHorizontal className="w-5 h-5" />
                                </button>
                            </div>

                            {content && (
                                <div className="text-[17px] text-zinc-100 leading-normal mb-3 whitespace-pre-wrap break-words">
                                    {content}
                                </div>
                            )}

                            <div className="flex items-center gap-1.5 text-[15px] text-zinc-500 mb-4 font-medium flex-wrap">
                                <span>{createdAt ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(createdAt)) : "--:--"}</span>
                                <span>·</span>
                                <span>{createdAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(createdAt)) : "Unknown date"}</span>
                            </div>

                            <div className="border-y border-white/10 py-3 flex items-center justify-between w-full">
                                <ActionButton icon={<BubbleIcon className="w-[20px] h-[20px]" />} count={0} hoverColor="hover:text-bleu text-zinc-500" />
                                <ActionButton icon={<RetweetIcon className="w-[20px] h-[20px]" />} count={0} hoverColor="hover:text-green-500 text-zinc-500" />
                                <ActionButton icon={<HeartIcon className="w-[20px] h-[20px]" />} count={0} hoverColor="hover:text-rose-500 text-zinc-500" />
                                <ActionButton icon={<BookmarkIcon className="w-[20px] h-[20px]" />} hoverColor="hover:text-bleu text-zinc-500" />
                                <ActionButton icon={<LinkIcon className="w-[20px] h-[20px]" />} hoverColor="hover:text-bleu text-zinc-500" />
                            </div>
                        </div>
                    </div>
                }
            />
        </div>
    );
}
