"use client";

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
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.content.getPostsByUser.useInfiniteQuery(
            { userId, limit: 20 },
            { getNextPageParam: (last) => last.nextCursor }
        );

    const seen = new Set<string>();
    const allPosts = (data?.pages.flatMap(p => p.posts) ?? []).filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });

    if (isLoading) {
        return (
            <div className="max-w-2xl">
                {Array.from({ length: 5 }).map((_, i) => (
                    <PostCardSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (allPosts.length === 0) {
        return (
            <div className="flex max-w-2xl flex-col items-center justify-center text-center py-24">
                <div className="size-24 rounded-[32px] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center mb-8 shadow-2xl">
                    <Plus size={40} className="text-zinc-600" />
                </div>
                <h3 className="text-3xl font-black text-white mb-3 tracking-tighter">No posts yet</h3>
                <p className="text-zinc-500 max-w-md text-[16px] leading-relaxed">
                    {isOwner ? "Share something with your followers." : "This user hasn't posted yet."}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
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
