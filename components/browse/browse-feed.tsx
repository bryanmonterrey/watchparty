"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import BidirectionalList, { type BidirectionalListRef } from "broad-infinite-list/react";
import { trpc } from "@/lib/trpc/client";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { PostComposer } from "./post-composer";
import { FeedTab } from "./feed-tab";
import React from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";
import { useAuthSession } from "@/hooks/use-auth-session";

type FeedType = "for-you" | "following" | "news";
type FeedItem = { type: "post"; createdAt: Date; data: any };

export function BrowseFeed() {
    const [activeTab, setActiveTab] = useState<FeedType>("for-you");
    const markedPageCount = useRef(0);
    const { data: session } = useAuthSession();
    const isLoggedIn = !!session?.user;

    // ── Feed queries ──────────────────────────────────────────────────────────
    const utils = trpc.useUtils();
    const {
        data: postData,
        fetchNextPage: fetchNextPosts,
        hasNextPage: hasNextPosts,
        isLoading: isLoadingPosts,
        isError,
    } = trpc.content.getFeed.useInfiniteQuery(
        { type: activeTab, limit: 20 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

    const isLoading = isLoadingPosts;

    // ── BidirectionalList state (per-tab) ────────────────────────────────────
    const listRef = useRef<BidirectionalListRef>(null);
    // Store items for each tab so switching back never re-shows skeletons
    const tabItemsCache = useRef<Map<FeedType, FeedItem[]>>(new Map());
    // Store scroll position per-tab so switching back restores where user was
    const tabScrollCache = useRef<Map<FeedType, number>>(new Map());
    const [listItems, setListItems] = useState<FeedItem[]>([]);
    const [listKey, setListKey] = useState(0);
    // Tracks which tabs have been populated at least once
    const populatedTabs = useRef<Set<FeedType>>(new Set());

    // ── Merged feed items (tRPC source of truth) ──────────────────────────────
    const feedItems = useMemo(() => {
        const rawPosts = (postData?.pages.flatMap((p) => p.posts) ?? []);
        const allItems: FeedItem[] = [];

        // Track IDs that have been "lifted" to be parents of replies
        const liftedIds = new Set<string>();
        // Track all post IDs in the current batch for quick lookup
        const batchIds = new Set(rawPosts.map(p => p.id));

        // Sort raw posts by date first
        const sortedPosts = [...rawPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        for (const p of sortedPosts) {
            // If this post was already lifted to be a parent of a newer reply, skip its standalone occurrence
            if (liftedIds.has(p.id)) continue;

            // If this is a reply and it has parent metadata, we might want to inject/lift the parent
            if (p.replyToId && p.parentUsername) {
                // If the parent is in the batch, we are "lifting" it. 
                // If it's not in the batch, we are "injecting" a virtual one.
                const parentInBatch = rawPosts.find(bp => bp.id === p.replyToId);

                // Inject the parent (either the real data or the virtual metadata)
                allItems.push({
                    type: "post",
                    createdAt: new Date(p.parentCreatedAt || p.createdAt),
                    data: parentInBatch ? {
                        ...parentInBatch,
                        connectBottom: true,
                    } : {
                        id: p.replyToId,
                        userId: p.parentUserId,
                        content: p.parentContent,
                        imageUrl: p.parentImageUrl,
                        media: p.parentMedia,
                        createdAt: p.parentCreatedAt,
                        user: {
                            id: p.parentUserId,
                            name: p.parentUserName,
                            username: p.parentUsername,
                            avatar_url: p.parentUserAvatar,
                            verifiedTier: p.parentUserVerifiedTier,
                        },
                        isVirtual: true,
                        feedKey: `virtual-parent-${p.replyToId}-${p.id}`,
                    }
                });

                liftedIds.add(p.replyToId);
            }

            allItems.push({
                type: "post",
                createdAt: new Date(p.createdAt),
                data: p,
            });
        }

        const uniqueSeen = new Set<string>();
        const filtered = allItems.filter((item) => {
            const key = item.data.feedKey ?? item.data.id;
            if (uniqueSeen.has(key)) return false;
            uniqueSeen.add(key);
            return true;
        });

        // Add thread connectivity metadata
        return filtered.map((item, i, arr) => {
            const next = arr[i + 1];
            const prev = arr[i - 1];

            // If the item below us is a reply to us, connect bottom
            // Check both id and feedKey to handle reposts and virtual posts correctly
            const isNextReplyToUs = next && (
                next.data.replyToId === item.data.id ||
                (item.data.feedKey && next.data.replyToId === item.data.feedKey)
            );
            const connectBottom = !!isNextReplyToUs;

            // If we are a reply to the item above us, connect top
            const isWeReplyToPrev = prev && (
                item.data.replyToId === prev.data.id ||
                (prev.data.feedKey && item.data.replyToId === prev.data.feedKey)
            );
            const connectTop = !!isWeReplyToPrev;

            return {
                ...item,
                data: {
                    ...item.data,
                    connectTop,
                    connectBottom,
                }
            };
        });
    }, [postData]);

    // Seed or Update listItems from tRPC data
    useEffect(() => {
        if (!isLoading && feedItems.length > 0) {
            const isFirstLoad = !populatedTabs.current.has(activeTab);

            if (isFirstLoad) {
                populatedTabs.current.add(activeTab);
                tabItemsCache.current.set(activeTab, feedItems);
                setListItems(feedItems);
            } else {
                // If already populated, check if there are NEWER items than what's in our cache
                const cached = tabItemsCache.current.get(activeTab) ?? [];
                const cachedKeys = new Set(cached.map(i => i.data.feedKey ?? i.data.id));
                const newItems = feedItems.filter(i => !cachedKeys.has(i.data.feedKey ?? i.data.id));

                if (newItems.length > 0) {
                    // Update cache to include these new items
                    const updated = [...newItems, ...cached].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                    tabItemsCache.current.set(activeTab, updated);

                    // If the user is at the top OR they just created a post, we can prepend immediately
                    // For now, let's just update listItems so it appears at the top
                    setListItems((prev) => {
                        const prevKeys = new Set(prev.map(i => i.data.feedKey ?? i.data.id));
                        const uniqueNew: FeedItem[] = [];
                        const seenInBatch = new Set<string>();

                        for (const item of newItems) {
                            const key = item.data.feedKey ?? item.data.id;
                            if (!prevKeys.has(key) && !seenInBatch.has(key)) {
                                uniqueNew.push(item);
                                seenInBatch.add(key);
                            }
                        }

                        if (uniqueNew.length === 0) return prev;
                        return [...uniqueNew, ...prev].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                    });
                }
            }
        }
    }, [feedItems, isLoading, activeTab]);

    // ── New-posts polling ─────────────────────────────────────────────────────
    const newestPostAt = useRef<string | null>(null);
    const [newPostsCount, setNewPostsCount] = useState(0);

    useEffect(() => {
        if (!postData?.pages?.[0]) return;
        if (!newestPostAt.current) newestPostAt.current = new Date().toISOString();
    }, [postData]);

    const { data: newCountData } = trpc.content.getNewPostsCount.useQuery(
        { since: newestPostAt.current ?? new Date().toISOString() },
        { enabled: !!newestPostAt.current, refetchInterval: 25_000, refetchIntervalInBackground: false, staleTime: 20_000 }
    );
    useEffect(() => {
        if (newCountData?.count && newCountData.count > 0) setNewPostsCount(newCountData.count);
    }, [newCountData]);

    // ── Composer visibility (for floating pill) ───────────────────────────────
    const composerRef = useRef<HTMLDivElement>(null);
    const [composerVisible, setComposerVisible] = useState(true);
    useEffect(() => {
        const el = composerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => setComposerVisible(entry.isIntersecting), { threshold: 0 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const loadNewPosts = useCallback(async () => {
        newestPostAt.current = new Date().toISOString();
        setNewPostsCount(0);

        // Fetch just the newest data silently
        const freshData = await utils.content.getFeed.fetchInfinite({ type: activeTab, limit: 20 });

        if (freshData?.pages?.[0]?.posts) {
            const newPosts = freshData.pages[0].posts.map((p: any) => ({
                type: "post" as const,
                createdAt: new Date(p.createdAt),
                data: p,
            }));

            setListItems((prev) => {
                const existingKeys = new Set(prev.map(i => i.data.feedKey ?? i.data.id));
                const uniqueNew: FeedItem[] = [];
                const seenInBatch = new Set<string>();

                for (const item of newPosts) {
                    const key = item.data.feedKey ?? item.data.id;
                    if (!existingKeys.has(key) && !seenInBatch.has(key)) {
                        uniqueNew.push(item);
                        seenInBatch.add(key);
                    }
                }

                // Force prepending and newest-first sorting
                return [...uniqueNew, ...prev].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            });

            // Update cache as well
            const cached = tabItemsCache.current.get(activeTab) ?? [];
            const cachedKeys = new Set(cached.map(i => i.data.feedKey ?? i.data.id));
            const uniqueNewForCache = newPosts.filter(i => !cachedKeys.has(i.data.feedKey ?? i.data.id));
            tabItemsCache.current.set(activeTab, [...uniqueNewForCache, ...cached].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        }

        // Always scroll to top when manually loading new posts
        window.scrollTo({ top: 0, behavior: "smooth" });
        listRef.current?.scrollToTop("smooth");
    }, [activeTab, utils]);

    // ── Real-time engagement updates ──────────────────────────────────────────
    useEffect(() => {
        const client = getRealtimeClient();

        const postChannel = client
            .channel("post-engagement")
            .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "posts" }, (payload: any) => {
                const updated = payload.new as { id: string; likes: number; reposts: number; comments: number; views: number };
                (["for-you", "following", "news"] as const).forEach((type) => {
                    utils.content.getFeed.setInfiniteData({ type, limit: 20 }, (old) => {
                        if (!old) return old;
                        return {
                            ...old,
                            pages: old.pages.map((page) => ({
                                ...page,
                                posts: page.posts.map((p: any) =>
                                    p.id === updated.id
                                        ? { ...p, likes: updated.likes, reposts: updated.reposts, comments: updated.comments, views: updated.views }
                                        : p
                                ),
                            })),
                        };
                    });
                });
                // Update listItems directly so visible cards re-render immediately
                setListItems((prev) =>
                    prev.map((item) =>
                        item.type === "post" && item.data.id === updated.id
                            ? { ...item, data: { ...item.data, likes: updated.likes, reposts: updated.reposts, comments: updated.comments, views: updated.views } }
                            : item
                    )
                );
            })
            .subscribe();

        return () => {
            postChannel.unsubscribe();
        };
    }, [utils]);

    // ── Tab switch ────────────────────────────────────────────────────────────
    const switchTab = (tab: FeedType) => {
        if (tab === activeTab) return;

        // Save current scroll position before leaving
        tabScrollCache.current.set(activeTab, document.getElementById("discover-feed-scroll")?.scrollTop ?? 0);

        markedPageCount.current = 0;
        newestPostAt.current = null;
        setNewPostsCount(0);
        setListKey((k) => k + 1);
        setActiveTab(tab);

        // Restore items instantly if already visited
        const cached = tabItemsCache.current.get(tab);
        const savedScroll = tabScrollCache.current.get(tab) ?? 0;
        setListItems(cached && cached.length > 0 ? cached : []);

        // Restore interaction state synchronously into refs so hearts render correctly on first paint
        const cachedInteractions = tabInteractionCache.current.get(tab);
        if (cachedInteractions) {
            likedPostIdsRef.current = { likedIds: cachedInteractions.likedIds };
            bookmarkedPostIdsRef.current = { bookmarkedIds: cachedInteractions.bookmarkedIds };
            repostedPostIdsRef.current = { repostedIds: cachedInteractions.repostedIds };
        }

        // Restore scroll position after the DOM has painted
        const feedEl = () => document.getElementById("discover-feed-scroll");
        if (cached && cached.length > 0 && savedScroll > 0) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    feedEl()?.scrollTo({ top: savedScroll, behavior: "instant" });
                });
            });
        } else {
            feedEl()?.scrollTo({ top: 0, behavior: "instant" });
        }
    };

    // ── Seen-posts debounced batch ────────────────────────────────────────────
    const markSeen = trpc.content.markPostsSeen.useMutation();
    const pendingSeenIds = useRef(new Set<string>());
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushSeen = () => {
        if (pendingSeenIds.current.size === 0) return;
        const ids = Array.from(pendingSeenIds.current);
        pendingSeenIds.current = new Set();
        markSeen.mutate({ postIds: ids });
    };

    useEffect(() => {
        if (!postData || activeTab === "following") return;
        const pages = postData.pages;
        if (pages.length <= markedPageCount.current) return;
        pages.slice(markedPageCount.current)
            .flatMap((p) => p.posts.map((post: any) => post.id))
            .forEach((id) => pendingSeenIds.current.add(id));
        markedPageCount.current = pages.length;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(flushSeen, 3000);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [postData]);

    useEffect(() => () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        flushSeen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── onLoadMore: fetch next page, return new items for the library ─────────
    // Track how many pages are already in the cache so we only return truly new items
    const pagesLoadedRef = useRef(0);
    useEffect(() => {
        if (postData?.pages.length) pagesLoadedRef.current = postData.pages.length;
    }, [postData]);

    const onLoadMore = useCallback(async (_direction: "up" | "down") => {
        // No need to guard hasNext here — the library already checks it before calling us
        const prevCount = pagesLoadedRef.current;
        const result = await fetchNextPosts();
        if (!result.data) return [];
        const newPages = result.data.pages.slice(prevCount);
        return newPages.flatMap((page: any) =>
            (page.posts ?? []).map((p: any) => ({
                type: "post" as const,
                createdAt: new Date(p.createdAt),
                data: p,
            }))
        ) as FeedItem[];
    }, [fetchNextPosts]);

    // ── Bulk interaction queries (keyed on all loaded items) ──────────────────
    const postIds = useMemo(() => listItems.filter((i) => i.type === "post").map((i) => i.data.id), [listItems]);

    const { data: likedPostIds } = trpc.content.getLikedPostIds.useQuery(
        { postIds, contentType: "post" },
        { enabled: isLoggedIn && postIds.length > 0, staleTime: 30_000 }
    );
    const { data: bookmarkedPostIds } = trpc.content.getBookmarkedPostIds.useQuery(
        { postIds, contentType: "post" },
        { enabled: isLoggedIn && postIds.length > 0, staleTime: 30_000 }
    );
    const { data: repostedPostIds } = trpc.content.getRepostedPostIds.useQuery(
        { postIds },
        { enabled: isLoggedIn && postIds.length > 0, staleTime: 30_000 }
    );

    // Per-tab interaction cache — restored synchronously on tab switch so hearts never flicker
    type InteractionState = { likedIds: string[]; bookmarkedIds: string[]; repostedIds: string[] };
    const tabInteractionCache = useRef<Map<FeedType, InteractionState>>(new Map());

    // Use refs so renderItem stays stable but always reads latest interaction state
    const likedPostIdsRef = useRef(likedPostIds);
    const bookmarkedPostIdsRef = useRef(bookmarkedPostIds);
    const repostedPostIdsRef = useRef(repostedPostIds);

    // Sync refs AND per-tab cache whenever query data arrives
    useEffect(() => {
        likedPostIdsRef.current = likedPostIds;
        if (likedPostIds) {
            const prev = tabInteractionCache.current.get(activeTab) ?? { likedIds: [], bookmarkedIds: [], repostedIds: [] };
            tabInteractionCache.current.set(activeTab, { ...prev, likedIds: likedPostIds.likedIds });
        }
    }, [likedPostIds, activeTab]);
    useEffect(() => {
        bookmarkedPostIdsRef.current = bookmarkedPostIds;
        if (bookmarkedPostIds) {
            const prev = tabInteractionCache.current.get(activeTab) ?? { likedIds: [], bookmarkedIds: [], repostedIds: [] };
            tabInteractionCache.current.set(activeTab, { ...prev, bookmarkedIds: bookmarkedPostIds.bookmarkedIds });
        }
    }, [bookmarkedPostIds, activeTab]);
    useEffect(() => {
        repostedPostIdsRef.current = repostedPostIds;
        if (repostedPostIds) {
            const prev = tabInteractionCache.current.get(activeTab) ?? { likedIds: [], bookmarkedIds: [], repostedIds: [] };
            tabInteractionCache.current.set(activeTab, { ...prev, repostedIds: repostedPostIds.repostedIds });
        }
    }, [repostedPostIds, activeTab]);

    // ── renderItem ────────────────────────────────────────────────────────────
    const renderItem = useCallback((item: FeedItem) => {
        // Prefer server-embedded interaction state (zero latency).
        // Fall back to ref-based bulk query data for any post the server didn't annotate.
        const liked = item.data.isLiked ?? likedPostIdsRef.current?.likedIds.includes(item.data.id) ?? false;
        const bookmarked = item.data.isBookmarked ?? bookmarkedPostIdsRef.current?.bookmarkedIds.includes(item.data.id) ?? false;
        const reposted = item.data.isReposted ?? repostedPostIdsRef.current?.repostedIds.includes(item.data.id) ?? false;
        return (
            <PostCard
                post={item.data}
                initialLiked={liked}
                initialBookmarked={bookmarked}
                initialReposted={reposted}
                isOwnPost={item.data.userId === session?.user?.id}
                connectTop={item.data.connectTop}
                connectBottom={item.data.connectBottom}
            />
        );
    }, [session?.user?.id]); // Depends on session so isOwnPost is correct

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col">
            {/* Tabs — flush at the top of the feed column, which sits ABOVE the
                app header (see the layout's z-index), so the header never covers
                them. */}
            <div className="flex items-center w-full sticky bg-background backdrop-blur-xl top-0 z-100 border-b border-soft-gray/[0.12]">
                <FeedTab
                    label="For you"
                    isActive={activeTab === "for-you"}
                    onClick={() => switchTab("for-you")}
                    suffix={<ChevronDown className="w-5 h-5 text-zinc-500" />}
                    className=""
                />
                <FeedTab label="Following" isActive={activeTab === "following"} onClick={() => switchTab("following")} />
                <FeedTab label="News" isActive={activeTab === "news"} onClick={() => switchTab("news")} />
            </div>

            {/* Floating "new posts" pill — parks just under the tab bar */}
            <div className="sticky top-[52px] z-50 h-0 overflow-visible">
                <AnimatePresence>
                    {newPostsCount > 0 && !composerVisible && (
                        <motion.div
                            key="floating-pill"
                            initial={{ y: -100 }}
                            animate={{ y: 0 }}
                            exit={{ y: -100 }}
                            transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
                            className="flex justify-center"
                        >
                            <button
                                onClick={loadNewPosts}
                                className="cursor-pointer flex items-center gap-1.5 bg-twitter2 active:scale-95 transition-all text-white text-sm font-bold px-4.5 py-2 rounded-full shadow-lg shadow-twitter2/30 mt-2"
                            >
                                <ArrowUp className="w-4 h-4" />
                                {newPostsCount} new post{newPostsCount !== 1 ? "s" : ""}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Composer */}
            <div ref={composerRef}>
                <PostComposer />
            </div>

            {/* Inline "Show X posts" bar */}
            {newPostsCount > 0 && (
                <button
                    onClick={loadNewPosts}
                    className="flex items-center justify-center gap-2 w-full py-3.5 border-b border-flexwhite/15 text-twitter2 hover:bg-twitter2/5 transition-colors text-md cursor-pointer font-semibold"
                >
                    Show {newPostsCount} post{newPostsCount !== 1 ? "s" : ""}
                </button>
            )}

            {/* Feed */}
            {isError ? (
                <div className="py-20 text-center text-zinc-500">
                    Failed to load feed. Please try again.
                </div>
            ) : isLoading && !populatedTabs.current.has(activeTab) ? (
                <div className="flex flex-col">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <PostCardSkeleton key={i} withMedia={i % 2 === 1} />
                    ))}
                </div>
            ) : feedItems.length === 0 && !isLoading ? (
                <div className="py-20 text-center text-zinc-500">
                    No posts yet. Be the first to post a banger!
                </div>
            ) : (() => {
                const currentItems = listItems.length > 0 ? listItems : feedItems;
                const uniqueMap = new Map<string, FeedItem>();
                for (const item of currentItems) {
                    const k = item.data.feedKey ?? item.data.id;
                    if (!uniqueMap.has(k)) {
                        uniqueMap.set(k, item);
                    }
                }
                const uniqueItems = Array.from(uniqueMap.values());

                return (
                    <BidirectionalList<FeedItem>
                        key={listKey}
                        ref={listRef}
                        items={uniqueItems}
                        itemKey={(item) => item.data.feedKey ?? item.data.id}
                        renderItem={renderItem}
                        onLoadMore={onLoadMore}
                        onItemsChange={setListItems}
                        hasPrevious={false}
                        hasNext={!!hasNextPosts}
                        viewCount={30}
                        useWindow={true}
                        spinnerRow={
                            <div className="flex justify-center py-4">
                                <div className="w-6 h-6 border-2 border-twitter2/30 border-t-twitter2 rounded-full animate-spin" />
                            </div>
                        }
                    />
                );
            })()}
        </div>
    );
}
