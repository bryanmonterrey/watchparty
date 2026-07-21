"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import BidirectionalList, { type BidirectionalListRef } from "broad-infinite-list/react";
import { trpc } from "@/lib/trpc/client";
import { PostCard } from "./post-card";
import { PollProvider } from "./poll-context";
import { PostCardSkeleton } from "./post-card-skeleton";
import { PostComposer } from "./post-composer";
import { FeedTab } from "./feed-tab";
import { SponsoredCard } from "@/components/ads/sponsored-card";
import { FEED_AD_INTERVAL } from "@/lib/ads/config";
import React from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useFeedDwell } from "@/hooks/use-feed-dwell";

type FeedType = "for-you" | "following" | "news";
type FeedItem = { type: "post"; createdAt: Date; data: any };

// BidirectionalList is a sliding window: it keeps VIEW_COUNT items in the DOM and
// asks for more via onLoadMore(direction, refItem) as you scroll. We feed it from
// a full ordered dataset (newest-first) so items evicted off one edge can be
// restored when scrolling back — see onLoadMore / hasPrevious / hasNext below.
// Feed tuning knobs. Change them HERE when scaling — values chosen for the
// current small dataset; at-scale targets noted inline.
//
// viewCount: max items kept in the DOM before the window trims off-screen ones.
//   Generous so the feed doesn't trim (and scroll-compensate, which snaps with
//   variable-height cards) until many posts are loaded. AT SCALE: 120.
// threshold: px from the edge to start loading — large so the next page is
//   prefetched well before the user reaches the bottom (no spinner stare).
// PAGE_SIZE: how many items the window advances per onLoadMore step. To load
//   more posts PER NETWORK FETCH at scale (target ~100), also raise the server
//   page in the getFeed useInfiniteQuery `limit` below — they should match.
// Keep this comfortably above the number of items a normal session loads so the
// window never trims newer items off the top. Trimming + the large prefetch
// threshold below would otherwise re-load those newer items at the TOP on any
// upward momentum while scrolling down — which reads as "new posts loaded at the
// top." X keeps already-seen items mounted; so do we until the at-scale cap.
const VIEW_COUNT = 120;
const LOAD_THRESHOLD_PX = 1200;
const PAGE_SIZE = 20; // at scale: 100 (keep in sync with getFeed `limit`)
const keyOf = (i: FeedItem) => i.data.feedKey ?? i.data.id;
function dedupNewestFirst(items: FeedItem[]): FeedItem[] {
    const seen = new Set<string>();
    const out: FeedItem[] = [];
    for (const it of items) {
        const k = keyOf(it);
        if (!seen.has(k)) { seen.add(k); out.push(it); }
    }
    return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Assemble raw feed posts into renderable items: lift self-thread parents directly
// above their reply and tag avatar-to-avatar connector flags. Pure so it can run on
// BOTH the full infinite-query set (feedItems) AND a freshly-paginated page inside
// onLoadMore — otherwise deep-scrolled (paginated) self-threads would never connect,
// because raw paginated items bypass this lift.
function assembleFeed(rawPosts: any[]): FeedItem[] {
    const allItems: FeedItem[] = [];
    // Track IDs lifted to be a parent of a newer reply, to skip their standalone copy.
    const liftedIds = new Set<string>();

    // Sort raw posts newest-first before lifting.
    const sortedPosts = [...rawPosts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const p of sortedPosts) {
        if (liftedIds.has(p.id)) continue;

        // Only SELF-THREADS connect (author replying to their own post), matching X.
        // A reply to someone else's post stays a standalone card — it still shows the
        // "Replying to @x" label (driven by parentUsername) but no lifted parent and
        // no connector line.
        const isSelfThread = p.replyToId && p.parentUsername && p.parentUserId === p.userId;
        if (isSelfThread) {
            // If the parent is in the batch we "lift" it; otherwise inject a virtual one.
            const parentInBatch = rawPosts.find((bp) => bp.id === p.replyToId);

            // Sort it to sit DIRECTLY above its reply by using the reply's time + 1ms —
            // NOT the parent's real (older) time. Every downstream newest-first re-sort
            // (dedupNewestFirst, when seeding the window or merging new posts) would
            // otherwise drop the older parent far below its reply, splitting the thread
            // and leaving dangling connector lines. A self-thread correctly floats to
            // its latest post.
            allItems.push({
                type: "post",
                createdAt: new Date(new Date(p.createdAt).getTime() + 1),
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

    // Add thread connectivity metadata based on the (lifted) adjacency.
    return filtered.map((item, i, arr) => {
        const next = arr[i + 1];
        const prev = arr[i - 1];

        // Connect only SELF-threads (same author): if the item below is the current
        // author's reply to us, connect bottom. Check both id and feedKey to handle
        // reposts and virtual (lifted) parents correctly.
        const isNextReplyToUs = next && next.data.userId === item.data.userId && (
            next.data.replyToId === item.data.id ||
            (item.data.feedKey && next.data.replyToId === item.data.feedKey)
        );
        const connectBottom = !!isNextReplyToUs;

        // If we are this author's reply to the item above us, connect top.
        const isWeReplyToPrev = prev && prev.data.userId === item.data.userId && (
            item.data.replyToId === prev.data.id ||
            (prev.data.feedKey && item.data.replyToId === prev.data.feedKey)
        );
        const connectTop = !!isWeReplyToPrev;

        return {
            ...item,
            data: { ...item.data, connectTop, connectBottom },
        };
    });
}

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
    // Full ordered dataset (newest-first) per tab — the source of truth the
    // sliding window slices from. Holds every loaded post: paginated-older ones
    // from the infinite query plus any newer ones prepended locally.
    const fullItemsRef = useRef<Map<FeedType, FeedItem[]>>(new Map());
    // Store scroll position per-tab so switching back restores where user was
    const tabScrollCache = useRef<Map<FeedType, number>>(new Map());
    const [listItems, setListItems] = useState<FeedItem[]>([]);
    const [listKey, setListKey] = useState(0);
    // Tracks which tabs have been populated at least once
    const populatedTabs = useRef<Set<FeedType>>(new Set());
    // The key of the feed's ESTABLISHED top per tab — the newest item present when
    // the tab first loaded (advanced only by the "new posts" pill). Scrolling up may
    // restore items the user already passed (between this and the window top) but must
    // NEVER surface anything sorted ABOVE it. Without this pin, a repost pulled in by
    // downward pagination (newer createdAt → re-sorted to full[0]) leaks to the top on
    // scroll-up — the bug. X keeps the top fixed; newer content waits behind the pill.
    const establishedTopKeyRef = useRef<Map<FeedType, string>>(new Map());
    const establishedTopIdx = (full: FeedItem[]) => {
        const k = establishedTopKeyRef.current.get(activeTab);
        if (!k) return 0;
        const i = full.findIndex((it) => keyOf(it) === k);
        return i < 0 ? 0 : i;
    };

    // ── Merged feed items (tRPC source of truth) ──────────────────────────────
    // assembleFeed (module-level) does the thread lift + connector tagging across
    // ALL loaded pages; onLoadMore reuses it so paginated threads connect too.
    const feedItems = useMemo(
        () => assembleFeed(postData?.pages.flatMap((p) => p.posts) ?? []),
        [postData]
    );

    // Keep the full per-tab dataset synced from the infinite query, then seed (or
    // top-up) the rendered window from it. Pagination of OLDER posts flows through
    // onLoadMore, not here — this effect only owns the full list + the window's top.
    useEffect(() => {
        if (isLoading || feedItems.length === 0) return;

        // Merge the infinite-query results with any items we prepended locally
        // (new-posts pill, realtime inserts) that aren't part of the query pages.
        const existingFull = fullItemsRef.current.get(activeTab) ?? [];
        const feedKeys = new Set(feedItems.map(keyOf));
        const localPrepends = existingFull.filter((i) => !feedKeys.has(keyOf(i)));
        const full = dedupNewestFirst([...localPrepends, ...feedItems]);
        fullItemsRef.current.set(activeTab, full);

        const isFirstLoad = !populatedTabs.current.has(activeTab);
        if (isFirstLoad) {
            populatedTabs.current.add(activeTab);
            const window = full.slice(0, VIEW_COUNT);
            if (full[0]) establishedTopKeyRef.current.set(activeTab, keyOf(full[0]));
            tabItemsCache.current.set(activeTab, window);
            setListItems(window);
            return;
        }

        // Already populated: only fold in items that are NEWER than the window's
        // current top (genuinely new posts). Older items are pagination the list
        // already owns — re-injecting them here is what replaced the feed.
        setListItems((prev) => {
            if (prev.length === 0) return full.slice(0, VIEW_COUNT);
            const topIdx = full.findIndex((i) => keyOf(i) === keyOf(prev[0]));
            if (topIdx <= 0) return prev; // window top is already the newest
            // Don't inject newer posts into the visible list while the user is
            // scrolled down — that shifts content under them (the bug). They stay
            // in `full` (reachable by scrolling up) and are surfaced by the
            // "new posts" pill. Only auto-fold when the user is already at the top.
            if (!composerVisibleRef.current) return prev;
            // Even at the top, never fold in items sorted ABOVE the established top
            // (e.g. a repost dragged up by a later page's newer createdAt) — those
            // belong behind the pill. Only restore seen items between the pinned top
            // and the window top.
            const estIdx = establishedTopIdx(full);
            if (estIdx >= topIdx) return prev;
            const newer = full.slice(estIdx, topIdx);
            const merged = dedupNewestFirst([...newer, ...prev]);
            tabItemsCache.current.set(activeTab, merged);
            return merged;
        });
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
    // Mirror visibility into a ref so the (feedItems-keyed) merge effect can read
    // the latest value without depending on it / going stale.
    const composerVisibleRef = useRef(true);
    useEffect(() => {
        const el = composerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            composerVisibleRef.current = entry.isIntersecting;
            setComposerVisible(entry.isIntersecting);
        }, { threshold: 0 });
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

            // Update the window cache and the full dataset so the new posts are
            // both visible and restorable when the user scrolls back up.
            const cached = tabItemsCache.current.get(activeTab) ?? [];
            const cachedKeys = new Set(cached.map(keyOf));
            const uniqueNewForCache = newPosts.filter(i => !cachedKeys.has(keyOf(i)));
            tabItemsCache.current.set(activeTab, dedupNewestFirst([...uniqueNewForCache, ...cached]));

            const full = fullItemsRef.current.get(activeTab) ?? [];
            const updatedFull = dedupNewestFirst([...newPosts, ...full]);
            fullItemsRef.current.set(activeTab, updatedFull);
            // The pill is the ONLY way the established top advances — adopt the new top.
            if (updatedFull[0]) establishedTopKeyRef.current.set(activeTab, keyOf(updatedFull[0]));
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
        tabScrollCache.current.set(activeTab, document.getElementById("app-scroll-container")?.scrollTop ?? 0);

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
        const feedEl = () => document.getElementById("app-scroll-container");
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

    // ── Dwell tracking (Phoenix ranker signal) ────────────────────────────────
    const { track: trackDwell } = useFeedDwell("home");

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
    const onLoadMore = useCallback(async (direction: "up" | "down", refItem: FeedItem) => {
        const full = fullItemsRef.current.get(activeTab) ?? [];
        const idx = full.findIndex((i) => keyOf(i) === keyOf(refItem));

        if (direction === "up") {
            // Restore seen items that were windowed out above the current top — but
            // never go above the ESTABLISHED top. Anything sorted above it (a repost
            // dragged up by a later page's newer createdAt) must not appear on
            // scroll-up; it waits behind the pill. This is the top-injection fix.
            if (idx <= 0) return [];
            const floor = establishedTopIdx(full);
            const start = Math.max(idx - PAGE_SIZE, floor);
            if (start >= idx) return [];
            return full.slice(start, idx);
        }

        // direction === "down": older items below the bottom edge.
        if (idx >= 0 && idx + 1 < full.length) {
            return full.slice(idx + 1, idx + 1 + PAGE_SIZE);
        }

        // Ran off the end of what's loaded — pull the next page, then RE-ASSEMBLE the
        // entire loaded set through assembleFeed so the new page's self-threads get
        // their parents lifted/connected too (raw paginated items would otherwise
        // bypass the lift and show disconnected). Fold local prepends back in the same
        // way the merge effect does, then hand the library the items positioned BELOW
        // the edge — sliced by index, not timestamp, so a lifted parent (time = reply
        // + 1ms) is never split from its reply across the page boundary.
        if (!hasNextPosts) return [];
        const result = await fetchNextPosts();
        if (!result.data) return [];
        const assembled = assembleFeed(result.data.pages.flatMap((page: any) => page.posts ?? []));
        const assembledKeys = new Set(assembled.map(keyOf));
        const localPrepends = (fullItemsRef.current.get(activeTab) ?? []).filter((i) => !assembledKeys.has(keyOf(i)));
        const newFull = dedupNewestFirst([...localPrepends, ...assembled]);
        fullItemsRef.current.set(activeTab, newFull);
        const refIdx = newFull.findIndex((i) => keyOf(i) === keyOf(refItem));
        if (refIdx < 0) return [];
        return newFull.slice(refIdx + 1, refIdx + 1 + PAGE_SIZE);
    }, [activeTab, hasNextPosts, fetchNextPosts]);

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
    // Maps each rendered item key → its position in the window, so renderItem can
    // inject a sponsored card every Nth row WITHOUT adding ad entries to the
    // virtualized dataset (which would corrupt keys/pagination/caches).
    const indexByKeyRef = useRef<Map<string, number>>(new Map());
    // Number of items in the currently-rendered window — used to detect the
    // window's bottom edge so we don't draw a thread line that points off-screen.
    const windowCountRef = useRef(0);
    const renderItem = useCallback((item: FeedItem) => {
        const key = keyOf(item);
        const idx = indexByKeyRef.current.get(key) ?? -1;
        // Thread edges: a connector is only valid when its counterpart is also
        // rendered. At the window's top edge the parent has been trimmed off, and
        // at the bottom edge the reply hasn't loaded yet — in both cases drop the
        // dangling line so the card renders as a normal standalone post (matches X).
        const isFirst = idx === 0;
        const isLast = idx === windowCountRef.current - 1;
        const connectTop = !!item.data.connectTop && !isFirst;
        const connectBottom = !!item.data.connectBottom && !isLast;
        // Never inject an ad in the middle of a thread (between a parent and its
        // reply) — it would break the connecting line.
        const showAd = idx > 0 && idx % FEED_AD_INTERVAL === 0 && !connectTop;
        // Prefer server-embedded interaction state (zero latency).
        // Fall back to ref-based bulk query data for any post the server didn't annotate.
        const liked = item.data.isLiked ?? likedPostIdsRef.current?.likedIds.includes(item.data.id) ?? false;
        const bookmarked = item.data.isBookmarked ?? bookmarkedPostIdsRef.current?.bookmarkedIds.includes(item.data.id) ?? false;
        const reposted = item.data.isReposted ?? repostedPostIdsRef.current?.repostedIds.includes(item.data.id) ?? false;
        return (
            <>
                {showAd && <SponsoredCard />}
                <div ref={trackDwell({ subjectId: item.data.id, authorId: item.data.userId })}>
                    <PostCard
                        post={item.data}
                        initialLiked={liked}
                        initialBookmarked={bookmarked}
                        initialReposted={reposted}
                        isOwnPost={item.data.userId === session?.user?.id}
                        connectTop={connectTop}
                        connectBottom={connectBottom}
                    />
                </div>
            </>
        );
    }, [session?.user?.id, trackDwell]); // session so isOwnPost is correct; trackDwell is stable

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <PollProvider postIds={postIds}>
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

            {/* Feed — keyed by tab so the incoming tab's list fades in on switch
                (the list itself already remounts per switch via listKey). */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
            >
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
                const currentItems = listItems.length > 0 ? listItems : feedItems.slice(0, VIEW_COUNT);
                const uniqueMap = new Map<string, FeedItem>();
                for (const item of currentItems) {
                    const k = item.data.feedKey ?? item.data.id;
                    if (!uniqueMap.has(k)) {
                        uniqueMap.set(k, item);
                    }
                }
                const uniqueItems = Array.from(uniqueMap.values());
                // Refresh the key→index map so renderItem can place sponsored cards.
                indexByKeyRef.current = new Map(uniqueItems.map((it, i) => [keyOf(it), i]));
                windowCountRef.current = uniqueItems.length;

                // The window's edges vs the full dataset decide whether the list
                // may scroll further. hasPrevious lets evicted-newer items be
                // restored on scroll-up (the bug fix); hasNext allows loading
                // older items, then more pages once the loaded set is exhausted.
                const full = fullItemsRef.current.get(activeTab) ?? [];
                const windowTop = uniqueItems[0];
                const windowBottom = uniqueItems[uniqueItems.length - 1];
                // Only allow scroll-up loading when there are SEEN items between the
                // pinned established top and the current window top. Comparing against
                // full[0] (not the established top) would let a leapfrogged repost
                // re-enable upward loading and inject at the top.
                const windowTopIdx = windowTop ? full.findIndex((i) => keyOf(i) === keyOf(windowTop)) : -1;
                const hasPrevious = windowTopIdx > establishedTopIdx(full);
                const atLoadedEnd = !!windowBottom && full.length > 0 && keyOf(full[full.length - 1]) === keyOf(windowBottom);
                const hasNext = !atLoadedEnd || !!hasNextPosts;

                return (
                    <BidirectionalList<FeedItem>
                        key={listKey}
                        ref={listRef}
                        items={uniqueItems}
                        itemKey={(item) => item.data.feedKey ?? item.data.id}
                        renderItem={renderItem}
                        onLoadMore={onLoadMore}
                        onItemsChange={setListItems}
                        hasPrevious={hasPrevious}
                        hasNext={hasNext}
                        viewCount={VIEW_COUNT}
                        threshold={LOAD_THRESHOLD_PX}
                        useWindow={true}
                        spinnerRow={
                            <div className="flex justify-center py-4">
                                <div className="w-6 h-6 border-2 border-twitter2/30 border-t-twitter2 rounded-full animate-spin" />
                            </div>
                        }
                    />
                );
            })()}
            </motion.div>
        </div>
        </PollProvider>
    );
}
