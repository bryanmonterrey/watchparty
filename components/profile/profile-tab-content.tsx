"use client";

import dynamic from "next/dynamic";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { UserType } from "@/db/schema/auth/user";
import { ProfileAbout } from "./profile-about";
import { ProfileHome } from "./home/profile-home";
import { useAuthSession } from "@/hooks/use-auth-session";
import { StreamViewer } from "@/components/streaming/stream-viewer";
import { trpc } from "@/lib/trpc/client";
import { PostCard } from "@/components/browse/post-card";
import { PollProvider } from "@/components/browse/poll-context";
import { PostCardSkeleton } from "@/components/browse/post-card-skeleton";
import { LoadMore } from "@/components/interior/load-more";
import { TradeRow } from "@/components/trades/trade-row";
import { ProfilePnlCard } from "./profile-pnl-card";
import { ProfileMediaGrid } from "./profile-media-grid";
import { profilePostsSnapshotStore } from "@/lib/snapshot/surfaces";
import { viewerKey } from "@/lib/snapshot/keys";
import { useSnapshot, useSnapshotPlaceholder } from "@/hooks/use-snapshot";
// Lazy: the predictions tab is rarely the landing tab, and this pulls in
// market cards + charts the rest of the profile never needs.
const PredictionsView = dynamic(
    () => import("@/components/predictions/predictions-view").then((m) => m.PredictionsView),
    { ssr: false }
);
import { PostsFilterRail, PostsFilterRow, PostsToolbar, type PostTypeFilter, type PostShowFilter, type PostSort } from "./posts-filter-rail";

interface ProfileTabContentProps {
    activeTab: string;
    user: UserType;
    /** Lets tab content deep-link into another tab (Home hero → Streams). */
    onTabChange?: (tab: string) => void;
}

function ProfileTradesFeed({ userId, name }: { userId: string; name: string }) {
    const { data, isLoading } = trpc.pnl.tradesForUser.useQuery({ userId, limit: 30 }, { refetchInterval: 60_000 });

    // Top-left, above the trade rows (moved off the profile header — owner
    // call 2026-07-19: the stat strip belongs with the trades it summarizes).
    const statsCard = <ProfilePnlCard userId={userId} name={name} />;

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 max-w-3xl">
                {statsCard}
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="shimmer-skeleton h-[64px] rounded-[20px]" />)}
            </div>
        );
    }
    if (!data?.visible) {
        return (
            <div className="flex flex-col gap-2 max-w-3xl">
                {statsCard}
                <div className="py-24 text-center">
                    <p className="text-sm font-semibold text-zinc-400">This user keeps their trades private.</p>
                </div>
            </div>
        );
    }
    if (data.items.length === 0) {
        return (
            <div className="flex flex-col gap-2 max-w-3xl">
                {statsCard}
                <div className="py-24 text-center">
                    <p className="text-sm font-semibold text-zinc-400">No trades yet.</p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 max-w-3xl">
            {statsCard}
            {data.items.map((t) => <TradeRow key={t.id} t={t} />)}
        </div>
    );
}

function ProfilePostsFeed({ userId, isOwner }: { userId: string; isOwner: boolean }) {
    const [type, setType] = useState<PostTypeFilter>("all");
    const [show, setShow] = useState<PostShowFilter>("all");
    const [sort, setSort] = useState<PostSort>("newest");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");

    // Debounce the search box so we don't refetch per keystroke.
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Keyed by BOTH the profile being viewed and the viewer: `getPostsByUser`
    // goes through `postSelectFields`, so these rows carry the *viewer's*
    // isLiked/isBookmarked/isReposted for someone else's posts.
    //
    // A search is deliberately never snapshotted. Every query string would mint
    // its own entry, evicting the profiles you actually revisit to cache a
    // one-off search you are unlikely to repeat.
    const { data: viewerSession } = useAuthSession();
    const snapshotKey = search
        ? ""
        : viewerKey(viewerSession?.user?.id, "profile-posts", userId, type, show, sort);
    const snapshotPlaceholder = useSnapshotPlaceholder(profilePostsSnapshotStore.read, snapshotKey);

    const { data, isLoading, fetchNextPage, hasNextPage, isPlaceholderData } =
        trpc.content.getPostsByUser.useInfiniteQuery(
            { userId, limit: 20, type, show, sort, search: search || undefined },
            {
                getNextPageParam: (last) => last.nextCursor,
                placeholderData: snapshotPlaceholder,
            }
        );

    useSnapshot(profilePostsSnapshotStore, snapshotKey, data, isPlaceholderData);

    const seen = new Set<string>();
    const allPosts = (data?.pages.flatMap(p => p.posts) ?? []).filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });

    const total = data?.pages[0]?.total;
    const filtersActive = type !== "all" || show !== "all" || search !== "";
    const resetFilters = () => { setType("all"); setShow("all"); setSearchInput(""); setSearch(""); };

    let feed: React.ReactNode;
    if (isLoading) {
        feed = Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />);
    } else if (allPosts.length === 0) {
        feed = (
            <div className="flex flex-col items-center justify-center text-center py-24">
                <div className="size-24 rounded-[32px] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center mb-8 shadow-2xl">
                    <Plus size={40} className="text-zinc-600" />
                </div>
                <h3 className="text-3xl font-black text-white mb-3 tracking-tighter">
                    {filtersActive ? "Nothing matches" : "No posts yet"}
                </h3>
                <p className="text-zinc-500 max-w-md text-[16px] leading-relaxed">
                    {filtersActive
                        ? "No posts match these filters."
                        : isOwner ? "Share something with your followers." : "This user hasn't posted yet."}
                </p>
                {filtersActive && (
                    <button
                        onClick={resetFilters}
                        className="mt-6 h-11 cursor-pointer rounded-full bg-white px-6 text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                    >
                        Reset filters
                    </button>
                )}
            </div>
        );
    } else {
        feed = (
            <>
                <PollProvider postIds={allPosts.map((p) => p.id)}>
                    {allPosts.map((post, i) => (
                        <PostCard
                            key={post.id}
                            post={{
                                ...post,
                                linkPreview: post.linkPreview as any,
                            }}
                            index={i}
                            isOwnPost={isOwner}
                        />
                    ))}
                </PollProvider>
                <LoadMore
                    onLoad={() => fetchNextPage()}
                    hasMore={!!hasNextPage}
                    className="py-4"
                    labels={{ end: "No more posts" }}
                />
            </>
        );
    }

    // Layout: the left region is flex-1 and the TOOLBAR (search + sort + count)
    // spans it fully — extending to ~40px (gap-10) before the rail. The feed
    // BODY is capped narrower (758px) so it sits with a gap to the rail while
    // the toolbar reaches it. (If the feed were w-full it would equal the
    // toolbar width and the toolbar would no longer extend past it.) Rail is
    // shrink-0 and sits at the content area's right edge.
    return (
        <div className="flex items-start gap-0 lg:gap-10">
            <div className="min-w-0 flex-1">
                <PostsToolbar
                    total={total}
                    search={searchInput}
                    onSearchChange={setSearchInput}
                    sort={sort}
                    onSortChange={setSort}
                />
                <PostsFilterRow userId={userId} type={type} onTypeChange={setType} />
                <div className="w-full max-w-[758px]">
                    {feed}
                </div>
            </div>
            <div className="hidden shrink-0 lg:block">
                <PostsFilterRail
                    userId={userId}
                    type={type}
                    show={show}
                    onTypeChange={setType}
                    onShowChange={setShow}
                    onReset={resetFilters}
                />
            </div>
        </div>
    );
}

export function ProfileTabContent({ activeTab, user, onTabChange }: ProfileTabContentProps) {
    const { data: session } = useAuthSession();
    const viewerUsername = session?.user?.username ?? session?.user?.name ?? "Guest";
    const isOwner = session?.user?.id === user.id;

    return (
        <div className="py-4 min-h-[500px] z-10">
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 1, y: 0 }}
                >
                    {/* About is the only tab that renders for now. Every other
                        tab is deliberately blank — no content AND no empty
                        state, so nothing is shown at all.

                        Nothing below was deleted: ProfileHome, StreamViewer,
                        ProfilePostsFeed, ProfileMediaGrid, ProfileTradesFeed
                        and PredictionsView are all still wired up in this file,
                        so restoring a tab is putting its branch back into this
                        conditional. That's also why the imports and the two
                        local feed components read as unused right now. */}
                    {activeTab === "About" && <ProfileAbout user={user} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
