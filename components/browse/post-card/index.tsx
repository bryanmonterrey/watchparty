"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { PostComposerDialog } from "@/components/browse/post-composer-dialog";
import { StatusBanners } from "./status-banners";
import { PostCardAvatar } from "./post-card-avatar";
import { PostCardHeaderRow } from "./post-card-header-row";
import { PostCardBody } from "./post-card-body";
import { PostCardActions } from "./post-card-actions";
import { BookmarkToast } from "./bookmark-toast";
import { UserHoverCard } from "../user-hover-card";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { useInstantNav } from "@/hooks/use-instant-nav";
import type { PostCardProps } from "./post-card.types";

export type { PostCardProps } from "./post-card.types";

export function PostCard({
    post,
    index = 0,
    initialLiked = false,
    initialBookmarked = false,
    initialReposted = false,
    isOwnPost = false,
    connectTop = false,
    connectBottom = false,
}: PostCardProps) {
    const {
        id, user, content, likes, reposts, comments, views,
        createdAt, originalCreatedAt, videoUrl, isPaywalled, paywallPrice,
        hasContentWarning, contentWarningText, linkPreview, isPinned,
        repostedBy, repostOfId, quotedPost,
    } = post;
    const router = useRouter();

    // Interaction target. A pure repost is already normalized by the feed router so
    // its `id` IS the original post — interact with that. A QUOTE is its own post (it
    // also carries a non-null `repostOfId` pointing at the quoted tweet), so its
    // likes/reposts/bookmarks must hit the quote's own id, NOT the quoted original —
    // matching X, where the embedded quote has no action buttons of its own. Hence
    // quotes target `id`; everything else falls back to `repostOfId || id`.
    const targetId = quotedPost ? id : (repostOfId || id);

    // ── UI state ─────────────────────────────────────────────────────────────
    const [showCommentDialog, setShowCommentDialog] = useState(false);
    const [showQuoteDialog, setShowQuoteDialog] = useState(false);
    const [showRepostMenu, setShowRepostMenu] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [isImageExpanded, setIsImageExpanded] = useState(false);
    const [mediaError, setMediaError] = useState(false);

    // ── Media validation ─────────────────────────────────────────────────────
    const rawImageUrl = post.imageUrl || (post as any).videoThumbnailUrl || null;
    const imageUrl = (rawImageUrl && typeof rawImageUrl === "string" && rawImageUrl.trim().length > 0 && (rawImageUrl.startsWith("http") || rawImageUrl.startsWith("/"))) ? rawImageUrl : null;
    const hasValidImage = !!(imageUrl && imageUrl !== "null" && imageUrl !== "undefined" && imageUrl.startsWith("http") && imageUrl.length > 12);
    const hasValidMedia = !!(post.media && post.media.length > 0 && post.media.some(m => m.url && m.url.startsWith("http") && m.url.length > 12));
    const showPaywall = !!isPaywalled && !isUnlocked;

    // ── Intersection observer (view tracking) ────────────────────────────────
    const cardRef = useRef<HTMLDivElement>(null);
    const viewedRef = useRef(false);
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();

    // Hover-intent prefetch (120ms rest, once per card): warm the post detail's
    // queries + route flight so clicking through paints with data instead of a
    // skeleton (staleTime 5m serves it on mount). Avatar hover warms the
    // profile route's RSC payload — the [slug] page is server-rendered, so
    // router.prefetch is the lever there, not a tRPC query.
    const detailPrefetch = useHoverPrefetch(() => {
        utils.content.getPost.prefetch({ postId: id });
        utils.comment.getComments.prefetch({ postId: id, limit: 20 });
        router.prefetch(`/status/${id}`);
    });
    const profilePrefetch = useHoverPrefetch(() => {
        if (user.username) router.prefetch(`/${user.username}`);
    });

    // Mouse-only pointerdown navigation — the click commits on press instead
    // of release (see the hook for the guard rails).
    const instantNav = useInstantNav(() => `/status/${post.id}`);

    const incrementView = trpc.content.incrementView.useMutation({
        onSuccess: () => {
            (["for-you", "following", "news"] as const).forEach(type => {
                utils.content.getFeed.setInfiniteData({ type, limit: 20 }, (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map(page => ({
                            ...page,
                            posts: page.posts.map((p: any) =>
                                p.id === post.id ? { ...p, views: (p.views ?? 0) + 1 } : p
                            ),
                        })),
                    };
                });
            });
        },
    });

    useEffect(() => {
        if (viewedRef.current) return;
        const el = cardRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !viewedRef.current) {
                viewedRef.current = true;
                incrementView.mutate({ postId: post.id, contentType: "post" });
                observer.disconnect();
            }
        }, { threshold: 0.5 });
        observer.observe(el);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [post.id]);

    // ── Server state queries (per-card, disabled until post-mutation) ─────────
    const { data: likedData } = trpc.content.getLikedPostIds.useQuery(
        { postIds: [targetId], contentType: "post" }, { enabled: false, staleTime: Infinity }
    );
    const { data: bookmarkedData } = trpc.content.getBookmarkedPostIds.useQuery(
        { postIds: [targetId], contentType: "post" }, { enabled: false, staleTime: Infinity }
    );
    const { data: repostedData } = trpc.content.getRepostedPostIds.useQuery(
        { postIds: [targetId] }, { enabled: false, staleTime: Infinity }
    );

    const serverLiked = likedData?.likedIds.includes(targetId) ?? initialLiked;
    const serverBookmarked = bookmarkedData?.bookmarkedIds.includes(targetId) ?? initialBookmarked;
    const serverReposted = repostedData?.repostedIds.includes(targetId) ?? initialReposted;

    // ── Optimistic overrides ─────────────────────────────────────────────────
    const [optLiked, setOptLiked] = useState<boolean | null>(null);
    const [optBookmarked, setOptBookmarked] = useState<boolean | null>(null);
    const [optReposted, setOptReposted] = useState<boolean | null>(null);

    const liked = optLiked ?? serverLiked;
    const bookmarked = optBookmarked ?? serverBookmarked;
    const reposted = optReposted ?? serverReposted;

    // Counts are DERIVED, not stored: the live `likes`/`reposts` props (patched by
    // the optimistic cache writes AND the realtime channel) plus the optimistic delta
    // — the difference between the pending toggle and server truth. Holding these in
    // `useState(likes)` silently dropped realtime count updates on already-mounted
    // cards, because useState ignores later prop changes. Deriving keeps one source of
    // truth. React guidance: https://react.dev/learn/you-might-not-need-an-effect
    // ?? 0: posts assembled client-side (the feed's virtual self-thread parents,
    // optimistic cache inserts) can omit counts, and undefined + delta is NaN —
    // which the repost span renders raw as "NaN".
    const likeCount = Math.max(0, (likes ?? 0) + (optLiked === null ? 0 : (optLiked ? 1 : 0) - (serverLiked ? 1 : 0)));
    const repostCount = Math.max(0, (reposts ?? 0) + (optReposted === null ? 0 : (optReposted ? 1 : 0) - (serverReposted ? 1 : 0)));

    // ── Cache patchers ───────────────────────────────────────────────────────
    // The flag (isLiked / isReposted / isBookmarked) is patched alongside the
    // count, not just the count. The feed row in the getFeed cache is what the
    // localStorage snapshot mirrors, so a row left at isLiked:false after a
    // like painted an EMPTY heart on the next visit until the refetch landed
    // (owner, 2026-10-09). On screen it looked right only because the per-card
    // getLikedPostIds entry below is written on success.
    const patchFeedRow = (patch: (p: any) => Record<string, unknown>) => {
        (["for-you", "following", "news"] as const).forEach(type => {
            utils.content.getFeed.setInfiniteData({ type, limit: 20 }, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map(page => ({
                        ...page,
                        posts: page.posts.map((p: any) =>
                            (p.repostOfId || p.id) === targetId ? { ...p, ...patch(p) } : p
                        ),
                    })),
                };
            });
        });
    };

    const patchFeedLike = (liked: boolean) =>
        patchFeedRow((p) => ({ isLiked: liked, likes: Math.max(0, (p.likes || 0) + (liked ? 1 : -1)) }));

    const patchFeedRepost = (reposted: boolean) =>
        patchFeedRow((p) => ({ isReposted: reposted, reposts: Math.max(0, (p.reposts || 0) + (reposted ? 1 : -1)) }));

    // ── Mutations ────────────────────────────────────────────────────────────
    const toggleLike = trpc.content.toggleLike.useMutation({
        onMutate: () => {
            setOptLiked(!liked);
        },
        onSuccess: async (data) => {
            patchFeedLike(data.liked);
            utils.content.getLikedPostIds.setData(
                { postIds: [targetId], contentType: "post" },
                { likedIds: data.liked ? [targetId] : [] }
            );
            setOptLiked(null);
        },
        onError: () => {
            setOptLiked(null);
        },
    });

    const toggleRepost = trpc.content.repost.useMutation({
        onMutate: () => {
            setOptReposted(!reposted);
        },
        onSuccess: async (data) => {
            patchFeedRepost(data.reposted);
            utils.content.getRepostedPostIds.setData(
                { postIds: [targetId] },
                { repostedIds: data.reposted ? [targetId] : [] }
            );
            setOptReposted(null);
        },
        onError: () => {
            setOptReposted(null);
        },
    });

    const toggleBookmark = trpc.content.toggleBookmark.useMutation({
        onMutate: () => setOptBookmarked(prev => !(prev ?? serverBookmarked)),
        onSuccess: async (data) => {
            patchFeedRow(() => ({ isBookmarked: data.bookmarked }));
            utils.content.getBookmarkedPostIds.setData(
                { postIds: [targetId], contentType: "post" },
                { bookmarkedIds: data.bookmarked ? [targetId] : [] }
            );
            utils.content.getBookmarks.invalidate();
            setOptBookmarked(null);
            if (!serverBookmarked) {
                toast.custom((id) => <BookmarkToast id={id} />, { duration: 3000 });
            }
        },
        onError: () => setOptBookmarked(null),
    });

    // ── Handlers ─────────────────────────────────────────────────────────────
    const processingLike = useRef(false);
    const handleLike = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (processingLike.current) return;
        processingLike.current = true;
        toggleLike.mutate({ postId: targetId, contentType: "post" });
        setTimeout(() => { processingLike.current = false; }, 150);
    };

    const processingRepost = useRef(false);
    const handleRepost = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowRepostMenu(prev => !prev);
    };
    const doRepost = () => {
        if (processingRepost.current) return;
        processingRepost.current = true;
        toggleRepost.mutate({ postId: targetId });
        setShowRepostMenu(false);
        setTimeout(() => { processingRepost.current = false; }, 150);
    };
    const doQuote = () => {
        setShowRepostMenu(false);
        setShowQuoteDialog(true);
    };
    const handleBookmark = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleBookmark.mutate({ postId: targetId, contentType: "post" });
    };
    const handleComment = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowCommentDialog(true);
    };

    // ── Hidden state ─────────────────────────────────────────────────────────
    if (isHidden) {
        return (
            <div className="px-4 py-3 border-b border-flexwhite/15 flex items-center justify-between text-sm text-zinc-600">
                <span>Post hidden</span>
                <button onClick={() => setIsHidden(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs">Undo</button>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <>
            <article
                ref={cardRef}
                {...detailPrefetch}
                onPointerDown={instantNav.onPointerDown}
                onClick={() => {
                    if (instantNav.consumedClick()) return;
                    router.push(`/status/${post.id}`);
                }}
                className={cn(
                    "group relative flex cursor-pointer flex-col bg-canvas px-4 pt-2.5 pb-1.5 transition-colors",
                    connectBottom ? "border-none pb-0" : "border-b border-soft-gray/[0.12]",
                    connectTop ? "pt-3" : "pt-2.5"
                )}
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
                {/* Thread line top — card-level so it spans the reply's top padding
                    and still meets the parent's bottom line at the card boundary. */}
                {connectTop && (
                    <div className="absolute top-0 left-[36px] -translate-x-1/2 w-0.5 h-7 bg-zinc-700/50 z-20" />
                )}

                {/* A threaded reply (member below its parent) never shows a
                    "reposted"/"Pinned" banner — that label belongs to standalone items. */}
                {!connectTop && <StatusBanners post={post} />}

                <div className="flex flex-row items-start space-x-2.5 w-full h-full">
                    {/* NO onClick and NO cursor-pointer here. self-stretch makes
                        this column as tall as the whole card, so a profile
                        handler on it turned the entire vertical strip beside the
                        post body into a profile link — clicking blank space next
                        to the text navigated away instead of opening the post.
                        The handler moved onto the avatar image itself. */}
                    <div
                        {...profilePrefetch}
                        className="self-stretch relative flex flex-col items-center"
                    >
                        {/* Thread line bottom — from just below the avatar to the card's
                            bottom edge (pb-0 when connectBottom). Meets the next card's
                            top line at the zero-gap boundary for one continuous line.
                            The next card's "reposted"/"Replying" banner is suppressed
                            (see StatusBanners gate) so nothing offsets the join. */}
                        {connectBottom && (
                            <div className="absolute top-[48px] bottom-0 left-[20px] -translate-x-1/2 w-0.5 bg-zinc-700/50 z-20" />
                        )}

                        <UserHoverCard userId={post.userId}>
                            <PostCardAvatar
                                user={user}
                                userId={post.userId}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (user.username) router.push(`/${user.username}`);
                                }}
                            />
                        </UserHoverCard>
                    </div>
                    
                    <div className="flex-1 w-full min-w-0 flex flex-col -mt-1">
                        <PostCardHeaderRow
                            post={post}
                            isOwnPost={isOwnPost}
                            showReportDialog={showReportDialog}
                            setShowReportDialog={setShowReportDialog}
                            setIsHidden={setIsHidden}
                        />

                        {post.parentUsername && !connectTop && (
                            <div className="text-[15px] text-postgray mb-1 -mt-1">
                                Replying to <span className="text-twitter2 hover:underline cursor-pointer">@{post.parentUsername}</span>
                            </div>
                        )}

                        <PostCardBody
                            post={post}
                            imageUrl={imageUrl}
                            showPaywall={showPaywall}
                            hasValidImage={hasValidImage}
                            hasValidMedia={hasValidMedia}
                            mediaError={mediaError}
                            isImageExpanded={isImageExpanded}
                            liked={liked}
                            bookmarked={bookmarked}
                            likeCount={likeCount}
                            reposts={repostCount}
                            views={views}
                            comments={comments}
                            setIsUnlocked={setIsUnlocked}
                            setMediaError={setMediaError}
                            setIsImageExpanded={setIsImageExpanded}
                            handleLike={handleLike}
                            handleBookmark={handleBookmark}
                            handleComment={handleComment}
                        />

                        <PostCardActions
                            post={post}
                            comments={comments}
                            repostCount={repostCount}
                            reposted={reposted}
                            showRepostMenu={showRepostMenu}
                            setShowRepostMenu={setShowRepostMenu}
                            likeCount={likeCount}
                            liked={liked}
                            views={views}
                            bookmarked={bookmarked}
                            handleComment={handleComment}
                            handleRepost={handleRepost}
                            doRepost={doRepost}
                            doQuote={doQuote}
                            handleLike={handleLike}
                            handleBookmark={handleBookmark}
                        />
                    </div>
                </div>
            </article>

            {/* Comment dialog */}
            <PostComposerDialog
                open={showCommentDialog}
                onOpenChange={setShowCommentDialog}
                mode="comment"
                post={post}
            />

            {/* Quote dialog */}
            <PostComposerDialog
                open={showQuoteDialog}
                onOpenChange={setShowQuoteDialog}
                mode="quote"
                post={post}
            />
        </>
    );
}
