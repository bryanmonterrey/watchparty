"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, ArrowLeft, Users, ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    VerifiedBadgeIcon,
    BusinessBadgeIcon,
    GovBadgeIcon,
    BubbleIcon,
    RetweetIcon,
    HeartIcon,
    HeartFilledIcon,
    BookmarkIcon,
    BookmarkFilledIcon,
    LinkIcon,
    GeminiIcon
} from "@/components/icons";
import { MediaGrid } from "@/components/browse/media-grid";
import { FeedVideoPlayer } from "@/components/video/feed-video-player";
import { ImageViewer } from "@/components/ui/image-viewer";
import { PollDisplay } from "@/components/browse/poll-display";
import { PostCardSkeleton } from "../post-card-skeleton";
import { QuotedPostView } from "../post-card/quoted-post-view";
import { PostOptionsMenu } from "../post-card/post-options-menu";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { CommentSection } from "../comment-section";
import { ActionButton } from "../post-card/action-button";
import { RepostMenu } from "../post-card/repost-menu";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostCardPost } from "../post-card/post-card.types";

interface PostDetailViewProps {
    postId: string;
}

export function PostDetailView({ postId }: PostDetailViewProps) {
    const router = useRouter();
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState("");
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();

    const { data: post, isLoading } = trpc.content.getPost.useQuery({ postId });
    const scrolledRef = React.useRef(false);

    // Reset scroll flag when navigating between posts
    React.useEffect(() => {
        scrolledRef.current = false;
    }, [postId]);

    // Double-frame scroll to ensure layout has settled
    React.useLayoutEffect(() => {
        if (post && (post as any).replyToId && !scrolledRef.current) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.getElementById('main-post-anchor');
                    if (el) {
                        el.scrollIntoView({ behavior: 'instant', block: 'start' });
                        scrolledRef.current = true;
                    }
                });
            });
        }
    }, [post]);

    // ── Interaction State (Updated when post is loaded) ──────────────────────
    const [localLiked, setLocalLiked] = useState<boolean | null>(null);
    const [localBookmarked, setLocalBookmarked] = useState<boolean | null>(null);
    const [localReposted, setLocalReposted] = useState<boolean | null>(null);
    const [localLikeCount, setLocalLikeCount] = useState<number | null>(null);
    const [localRepostCount, setLocalRepostCount] = useState<number | null>(null);
    const [localBookmarkCount, setLocalBookmarkCount] = useState<number | null>(null);

    // ── Reply State ────────────────────────────────────────────────────────
    const [replyText, setReplyText] = useState("");
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [showRepostMenu, setShowRepostMenu] = useState(false);

    // Sync local state when post loads
    React.useEffect(() => {
        if (post) {
            setLocalLiked(post.isLiked ?? false);
            setLocalBookmarked(post.isBookmarked ?? false);
            setLocalReposted(post.isReposted ?? false);
            setLocalLikeCount(post.likes);
            setLocalRepostCount(post.reposts);
            setLocalBookmarkCount(post.bookmarks ?? 0);
        }
    }, [post]);


    // ── Mutations ────────────────────────────────────────────────────────────
    const toggleLike = trpc.content.toggleLike.useMutation({
        onMutate: () => {
            const next = !localLiked;
            setLocalLiked(next);
            setLocalLikeCount(prev => (prev ?? 0) + (next ? 1 : -1));
        },
        onSuccess: (data: { liked: boolean }) => {
            setLocalLiked(data.liked);
            utils.content.getPost.invalidate({ postId });
        }
    });

    const toggleRepost = trpc.content.repost.useMutation({
        onMutate: () => {
            const next = !localReposted;
            setLocalReposted(next);
            setLocalRepostCount(prev => (prev ?? 0) + (next ? 1 : -1));
        },
        onSuccess: (data: { reposted: boolean }) => {
            setLocalReposted(data.reposted);
            utils.content.getPost.invalidate({ postId });
        }
    });

    const toggleBookmark = trpc.content.toggleBookmark.useMutation({
        onMutate: () => {
            setLocalBookmarked(prev => {
                const next = !prev;
                setLocalBookmarkCount(c => Math.max(0, (c ?? 0) + (next ? 1 : -1)));
                return next;
            });
        },
        onSuccess: (data: { bookmarked: boolean }) => {
            setLocalBookmarked(data.bookmarked);
            utils.content.getPost.invalidate({ postId });
        }
    });

    const createComment = trpc.comment.createComment.useMutation({
        onSuccess: () => {
            setReplyText("");
            utils.comment.getComments.invalidate({ postId });
            utils.content.getPost.invalidate({ postId });
        }
    });

    // ── Render Helpers ──────────────────────────────────────────────────────
    const renderHeader = () => (
        <div className="flex flex-row items-center justify-start gap-5 backdrop-blur-sm w-full bg-black/40 sticky top-0 z-100">
            <button
                onClick={() => router.back()}
                className="px-4 cursor-pointer h-13 flex items-center justify-center text-zinc-100 hover:text-zinc-300 hover:bg-zinc-500/20 transition-colors"
            >
                <ChevronLeft className="w-7 h-7" />
            </button>
            <div className="flex items-center justify-center">
                <span className="font-extrabold text-zinc-100 text-lg">Post</span>
            </div>
        </div>
    );

    const renderPostSkeleton = () => (
        <div className="px-4 pt-4">
            <div className="flex gap-3 mb-4">
                <div className="w-12 h-12 rounded-full shimmer-skeleton shrink-0" />
                <div className="flex flex-col gap-2 flex-1 pt-1">
                    <div className="h-5 w-32 rounded-full shimmer-skeleton" />
                    <div className="h-5 w-24 rounded-full shimmer-skeleton" />
                </div>
            </div>
            <div className="space-y-3 mb-6">
                <div className="h-5 w-full rounded-full shimmer-skeleton" />
                <div className="h-5 w-full rounded-full shimmer-skeleton" />
                <div className="h-5 w-4/5 rounded-full shimmer-skeleton" />
            </div>
            <div className="h-13 w-full border-y border-flexborder flex items-center justify-around">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-5 w-9 rounded-full shimmer-skeleton" />
                ))}
            </div>
            <div className="flex items-center justify-between gap-3 pb-6 pt-3 px-0 border-b border-flexborder">
                <div className="w-9 h-9 rounded-full shimmer-skeleton shrink-0" />
                <div className="h-9 w-20 rounded-full shimmer-skeleton" />
            </div>
        </div>
    );

    const renderNotFound = () => (
        <div className="flex flex-col items-center justify-center py-20 bg-black">
            <p className="text-zinc-500">Post not found.</p>
            <button onClick={() => router.back()} className="mt-4 text-bleu hover:underline">Go back</button>
        </div>
    );

    const liked = localLiked ?? (post?.isLiked ?? false);
    const bookmarked = localBookmarked ?? (post?.isBookmarked ?? false);
    const reposted = localReposted ?? (post?.isReposted ?? false);
    const likeCount = localLikeCount ?? (post?.likes ?? 0);
    const repostCount = localRepostCount ?? (post?.reposts ?? 0);
    const bookmarkCount = localBookmarkCount ?? (post?.bookmarks ?? 0);

    const displayCreatedAt = post?.originalCreatedAt ?? post?.createdAt;
    const formattedTime = displayCreatedAt ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(displayCreatedAt)) : "--:--";
    const formattedDate = displayCreatedAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(displayCreatedAt)) : "Unknown date";

    const processingLike = React.useRef(false);
    const handleLike = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (processingLike.current || !post) return;
        processingLike.current = true;
        toggleLike.mutate({ postId: post.id, contentType: "post" });
        setTimeout(() => { processingLike.current = false; }, 150);
    };

    const processingRepost = useRef(false);
    const handleRepost = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowRepostMenu(prev => !prev);
    };
    const doRepost = () => {
        if (processingRepost.current || !post) return;
        processingRepost.current = true;
        toggleRepost.mutate({ postId: post.id });
        setShowRepostMenu(false);
        setTimeout(() => { processingRepost.current = false; }, 150);
    };

    const formattedViews = post?.views !== undefined ? (post.views >= 1000 ? `${(post.views / 1000).toFixed(1)}K` : post.views) : "0";

    const handleReply = (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim() || createComment.isPending || !post) return;
        createComment.mutate({ postId: post.id, content: replyText.trim() });
    };

    return (
        <>
            <div className="flex flex-col w-full bg-black min-h-screen">
                {renderHeader()}

                {isLoading ? (
                    renderPostSkeleton()
                ) : !post ? (
                    renderNotFound()
                ) : (
                    <article className={cn("", (post as any).replyToId && "min-h-[160vh]")}>
                        {/* Parent Thread View */}
                        {(post as any).replyToId && (post as any).parentUserId && (
                            <div
                                className="px-4 relative group/parent cursor-pointer hover:bg-white/[0.02] transition-colors pb-1 pt-3"
                                onClick={() => router.push(`/feed/post/${(post as any).replyToId}`)}
                            >
                                {/* Connector line */}
                                <div className="absolute left-[39.5px] top-8 -bottom-6 w-0.5 bg-zinc-700/50 z-20" />

                                <div className="flex gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0 relative z-30">
                                        {(post as any).parentUserAvatar ? (
                                            <img src={(post as any).parentUserAvatar} alt={(post as any).parentUserName || "User"} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 font-bold text-lg">
                                                {((post as any).parentUserName?.[0] || "U")}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="font-bold text-white text-[15px] hover:underline truncate">
                                                {(post as any).parentUserName || ""}
                                            </span>
                                            {(post as any).parentUserVerifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                                            <span className="text-zinc-500 text-[15px]">@{(post as any).parentUsername}</span>
                                            <span className="text-zinc-500 text-[15px]">·</span>
                                            <span className="text-zinc-500 text-[15px]">
                                                {(post as any).parentCreatedAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date((post as any).parentCreatedAt)) : ""}
                                            </span>
                                        </div>
                                        <div className="text-[15px] text-zinc-100 leading-normal line-clamp-4 whitespace-pre-wrap">
                                            {(post as any).parentContent}
                                        </div>

                                        {/* Parent Media Preview */}
                                        {((post as any).parentImageUrl || ((post as any).parentMedia && (post as any).parentMedia.length > 0)) && (
                                            <div className="mt-2 rounded-xl overflow-hidden w-fit bg-zinc-900/50 h-fit">
                                                <MediaGrid
                                                    media={(post as any).parentMedia && (post as any).parentMedia.length > 0
                                                        ? (post as any).parentMedia
                                                        : [{ type: "image", url: (post as any).parentImageUrl! }]}
                                                    onImageClick={(index) => {
                                                        const pMedia = (post as any).parentMedia;
                                                        const urls = (pMedia && pMedia.length > 0)
                                                            ? pMedia.map((m: any) => m.url)
                                                            : [(post as any).parentImageUrl];
                                                        setViewerImage(urls[index] || "");
                                                        setViewerOpen(true);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Author Row */}
                        <div
                            id="main-post-anchor"
                            className="px-4 flex items-start justify-between mt-2 mb-4 scroll-mt-[55px] outline-none"
                        >
                            <div className="flex items-center gap-3 relative">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0 relative z-30">
                                    {post.user.avatar_url ? (
                                        <img src={post.user.avatar_url} alt={post.user.name || "User"} className="w-full h-full object-cover relative z-10" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 font-bold text-lg relative z-10">
                                            {(post.user.name?.[0] || "U")}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col text-left">
                                    <div className="flex items-center gap-1">
                                        <span className="font-bold text-white text-[16px] hover:underline cursor-pointer truncate max-w-[200px]">
                                            {post.user.name || ""}
                                        </span>
                                        {post.user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                                        {post.user.verifiedTier === "business" && <BusinessBadgeIcon className="w-4 h-4 shrink-0" />}
                                        {post.user.verifiedTier === "government" && <GovBadgeIcon className="w-4 h-4 shrink-0" />}
                                    </div>
                                    <span className="text-zinc-500 text-[15px]">@{post.user.username || "user"}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {session?.user?.id !== post.user.id && (
                                    <SubscribeButton creatorId={post.user.id} creatorName={post.user.name || post.user.username || "Creator"} />
                                )}
                                <div className="flex items-center gap-0.5">
                                    <button className="text-white2 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors">
                                        <GeminiIcon className="w-5 h-5" />
                                    </button>
                                    <PostOptionsMenu
                                        postId={post.id}
                                        userId={post.user.id}
                                        username={post.user.username}
                                        onClose={() => setShowReportDialog(false)}
                                        onHide={() => router.push("/home")}
                                        isOwnPost={session?.user?.id === post.user.id}
                                        isPinned={post.isPinned}
                                        open={showReportDialog}
                                        onOpenChange={setShowReportDialog}
                                        triggerClassName="text-zinc-500 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
                                        trigger={<MoreHorizontal className="w-5 h-5" />}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-4 mb-4">
                            {post.parentUsername && (
                                <div className="text-[15px] text-zinc-500 mb-2">
                                    Replying to <span className="text-twitter2 hover:underline cursor-pointer">@{post.parentUsername}</span>
                                </div>
                            )}
                            {post.content && (
                                <div className="text-[20px] text-zinc-100 leading-normal mb-4 whitespace-pre-wrap break-words text-left">
                                    {post.content}
                                </div>
                            )}

                            {/* Media */}
                            {(post.videoUrl || (post.media && post.media.length > 0) || post.imageUrl || post.token_image) && (
                                <div className="rounded-2xl overflow-hidden mb-4">
                                    {post.videoUrl ? (
                                        <FeedVideoPlayer postId={post.id} videoUrl={post.videoUrl} poster={post.imageUrl} className="rounded-2xl" />
                                    ) : (
                                        <MediaGrid
                                            media={post.media && post.media.length > 0 ? post.media : [{ type: "image", url: (post.imageUrl || post.token_image)! }]}
                                            onImageClick={(index) => {
                                                const mArray = post.media;
                                                const urls = (mArray && mArray.length > 0)
                                                    ? mArray.map(m => m.url)
                                                    : [(post.imageUrl || post.token_image)];
                                                setViewerImage(urls[index] || "");
                                                setViewerOpen(true);
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Quoted Post */}
                            {post.quotedPost && (
                                <div className="mb-4">
                                    <QuotedPostView quotedPost={post.quotedPost as any} />
                                </div>
                            )}

                            <PollDisplay postId={post.id} />
                        </div>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-1 text-[15px] text-zinc-500 px-4 pt-4 pb-2">
                            <span>{formattedTime}</span>
                            <span className="mx-1">·</span>
                            <span>{formattedDate}</span>
                            <span className="mx-1">·</span>
                            <span className="text-zinc-100 font-bold">{formattedViews}</span>
                            <span className="ml-1">Views</span>
                        </div>

                        {/* Unified Action Bar */}
                        <div className="px-4">
                            <div className="flex items-center justify-between pt-1 pb-0 border-t border-flexborder">
                                <ActionButton
                                    icon={<BubbleIcon className="w-[20px] h-[20px]" />}
                                    count={post.comments}
                                    hoverColor="hover:text-twitter2"
                                    hoverBg="hover:bg-twitter2/10"
                                    onClick={handleReply}
                                    activeColor="text-twitter2"
                                />

                                <RepostMenu
                                    open={showRepostMenu}
                                    onOpenChange={setShowRepostMenu}
                                    reposted={reposted}
                                    repostCount={repostCount}
                                    onRepostClick={handleRepost}
                                    onDoRepost={doRepost}
                                    onDoQuote={() => { setShowRepostMenu(false); /* open quote dialog if implemented */ }}
                                    className="p-0"
                                    buttonClassName="p-0"
                                    iconSize="w-[20px] h-[20px]"
                                />

                                <ActionButton
                                    icon={liked ? <HeartFilledIcon className="w-[20px] h-[20px]" /> : <HeartIcon className="w-[20px] h-[20px]" />}
                                    count={likeCount}
                                    hoverColor="hover:text-red1"
                                    hoverBg="hover:bg-red1/10"
                                    onClick={(e) => { e.stopPropagation(); toggleLike.mutate({ postId: post.id, contentType: "post" }); }}
                                    active={liked}
                                    activeColor="text-red1"
                                />

                                <ActionButton
                                    icon={bookmarked ? <BookmarkFilledIcon className="w-[20px] h-[20px]" /> : <BookmarkIcon className="w-[20px] h-[20px]" />}
                                    hoverColor="hover:text-twitter2"
                                    hoverBg="hover:bg-twitter2/10"
                                    onClick={(e) => { e.stopPropagation(); toggleBookmark.mutate({ postId: post.id, contentType: "post" }); }}
                                    active={bookmarked}
                                    activeColor="text-twitter2"
                                />

                                <ActionButton
                                    icon={<LinkIcon className="w-[20px] h-[20px]" />}
                                    hoverColor="hover:text-twitter2"
                                    hoverBg="hover:bg-twitter2/10"
                                />
                            </div>


                            {/* Sub-actions (Relevant / View Quotes) */}
                            <div className={cn(
                                "flex items-center pb-2 border-b border-flexborder",
                                ((post as any).quoteCount && (post as any).quoteCount > 0) ? "justify-between" : "justify-start"
                            )}>
                                <button className="font-semibold flex items-center gap-1 text-[15px] text-zinc-500 hover:bg-zinc-800/50 py-0.5 rounded transition-colors">
                                    <span>Relevant</span>
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                                {((post as any).quoteCount && (post as any).quoteCount > 0) && (
                                    <button className="font-semibold flex items-center gap-1 text-[15px] text-zinc-500 hover:bg-zinc-800/50 py-0.5 rounded transition-colors">
                                        <span>View quotes</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Inline Reply Box */}
                        <form onSubmit={handleReply} className="flex w-full items-center gap-3 pt-4 pb-9 border-b border-flexborder px-4">
                            <div className="w-9 h-9 rounded-full bg-zinc-800 shrink-0 overflow-hidden">
                                {session?.user?.avatar_url ? (
                                    <img src={session.user.avatar_url} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900 border border-flexborder">
                                        <Users className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex items-center gap-3">
                                <textarea
                                    value={replyText}
                                    onChange={(e) => {
                                        setReplyText(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    placeholder="Post your reply"
                                    rows={1}
                                    className="bg-transparent text-[20px] text-zinc-100 placeholder:text-zinc-500 outline-none resize-none flex-1 pb-1 overflow-hidden min-h-[36px]"
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || createComment.isPending}
                                    className="bg-white2 hover:bg-white transition-colors text-black px-4 py-1.5 rounded-full font-bold text-lg disabled:opacity-50 shrink-0"
                                >
                                    {createComment.isPending ? "..." : "Reply"}
                                </button>
                            </div>
                        </form>
                    </article>
                )}

                <CommentSection
                    postId={postId}
                    hideComposer={true}
                />
            </div>

            {post && (
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
                                            {post.user.avatar_url ? (
                                                <img src={post.user.avatar_url} alt={post.user.name || "User"} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 font-bold">{(post.user.name?.[0] || "U")}</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-zinc-100">{post.user.name || ""}</span>
                                                {post.user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                                                <GeminiIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                                            </div>
                                            <span className="text-zinc-500 text-[15px]">@{post.user.username || "user"}</span>
                                        </div>
                                    </div>
                                    <button className="text-zinc-500 hover:text-zinc-100 hover:bg-white/10 p-2 rounded-full transition-colors">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </div>

                                {post.content && (
                                    <div className="text-[17px] text-zinc-100 leading-normal mb-3 whitespace-pre-wrap break-words">
                                        {post.content}
                                    </div>
                                )}

                                <div className="flex items-center gap-1.5 text-[15px] text-zinc-500 mb-4 font-medium flex-wrap">
                                    <span>{formattedTime}</span>
                                    <span>·</span>
                                    <span>{formattedDate}</span>
                                    {post.views !== undefined && (
                                        <>
                                            <span>·</span>
                                            <span className="text-white font-bold">{post.views}</span>
                                            <span>Views</span>
                                        </>
                                    )}
                                </div>

                                <div className="border-y border-white/10 py-3 flex items-center justify-between w-full">
                                    <ActionButton icon={<BubbleIcon className="w-[20px] h-[20px]" />} count={post.comments} hoverColor="hover:text-bleu text-zinc-500" />
                                    <ActionButton icon={<RetweetIcon className="w-[20px] h-[20px]" />} count={repostCount} hoverColor="hover:text-green-500 text-zinc-500" />
                                    <ActionButton icon={liked ? <HeartFilledIcon className="w-[20px] h-[20px]" /> : <HeartIcon className="w-[20px] h-[20px]" />} count={likeCount} hoverColor="hover:text-rose-500 text-zinc-500" onClick={(e) => { e.stopPropagation(); toggleLike.mutate({ postId: post.id, contentType: "post" }); }} active={liked} activeColor="text-rose-500" />
                                    <ActionButton icon={bookmarked ? <BookmarkFilledIcon className="w-[20px] h-[20px]" /> : <BookmarkIcon className="w-[20px] h-[20px]" />} hoverColor="hover:text-bleu text-zinc-500" onClick={(e) => { e.stopPropagation(); toggleBookmark.mutate({ postId: post.id, contentType: "post" }); }} active={bookmarked} activeColor="text-bleu" />
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
                />
            )}
        </>
    );
}
