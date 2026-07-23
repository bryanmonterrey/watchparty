"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
import { TradeRow } from "@/components/trades/trade-row";
import { ProfilePnlCard } from "./profile-pnl-card";
import { ProfileMediaGrid } from "./profile-media-grid";
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

    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.content.getPostsByUser.useInfiniteQuery(
            { userId, limit: 20, type, show, sort, search: search || undefined },
            { getNextPageParam: (last) => last.nextCursor }
        );

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
                {hasNextPage && (
                    <div className="flex justify-center py-4">
                        <button
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                        >
                            {isFetchingNextPage ? "Loading…" : "Load more"}
                        </button>
                    </div>
                )}
            </>
        );
    }

    // Layout: feed | gap | rail | sidebar-width padding. The gap is a fixed
    // 130px (half the former ~260px elastic gap); the feed absorbed that other
    // 130px, so its body fills the widened left region (~758px at the 1400px
    // content width) instead of the 628px discover cap. Rail is shrink-0
    // against the lg:pr-[14rem] inset applied by ProfileTabContent.
    return (
        <div className="flex items-start gap-0 lg:gap-[130px]">
            {/* Left region fills up to the rail; the toolbar (search + sort +
                count) and the feed body both span it. */}
            <div className="min-w-0 flex-1">
                <PostsToolbar
                    total={total}
                    search={searchInput}
                    onSearchChange={setSearchInput}
                    sort={sort}
                    onSortChange={setSort}
                />
                <PostsFilterRow userId={userId} type={type} onTypeChange={setType} />
                <div className="w-full">
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

    // Video-first tabs (Home rail, Videos, Streams) use the full width; every
    // reading tab — INCLUDING Posts — gets a right inset the size of the
    // EXPANDED sidebar (owner call 2026-07-22). On Posts the filter rail
    // (flex-1 justify-end) sits flush against this padding, so there's a
    // sidebar-width gap between the rail and the screen edge.
    const fullBleedTab = ["Home", "Videos", "Streams"].includes(activeTab);

    return (
        <div className={cn(
            "py-4 min-h-[500px] z-10",
            !fullBleedTab && "lg:pr-[var(--sidebar-width,14rem)]",
        )}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 1, y: 0 }}
                >
                    {activeTab === "Home" ? (
                        <ProfileHome user={user} onTabChange={onTabChange} />
                    ) : activeTab === "About" ? (
                        <ProfileAbout user={user} />
                    ) : activeTab === "Streams" ? (
                        <StreamViewer
                            hostUserId={user.id}
                            hostUsername={user.username ?? user.name ?? ""}
                            viewerUsername={viewerUsername}
                        />
                    ) : activeTab === "Posts" ? (
                        <ProfilePostsFeed userId={user.id} isOwner={isOwner} />
                    ) : activeTab === "Media" ? (
                        <ProfileMediaGrid userId={user.id} isOwner={isOwner} />
                    ) : activeTab === "Trades" ? (
                        <ProfileTradesFeed userId={user.id} name={user.name} />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center py-24">
                            <div className="size-24 rounded-[32px] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center mb-8 shadow-2xl relative group overflow-hidden">
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Plus size={40} className="text-zinc-600 group-hover:text-white transition-all transform group-hover:scale-110 duration-500" />
                            </div>
                            <h3 className="text-3xl font-black text-white mb-3 tracking-tighter">Nothing here yet</h3>
                            <p className="text-zinc-500 max-w-md text-[16px] leading-relaxed">
                                {activeTab} content will appear here.
                            </p>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
