"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./post-card-skeleton";
import { UserResultCard } from "./user-result-card";
import { Loader2 } from "lucide-react";

type SearchTab = "top" | "latest" | "people" | "media" | "lists";

interface SearchResultsViewProps {
    query: string;
}

export function SearchResultsView({ query }: SearchResultsViewProps) {
    const [activeTab, setActiveTab] = useState<SearchTab>("top");

    const tabs: { id: SearchTab; label: string }[] = [
        { id: "top", label: "Top" },
        { id: "latest", label: "Latest" },
        { id: "people", label: "People" },
        { id: "media", label: "Media" },
        { id: "lists", label: "Lists" },
    ];

    // Queries
    const postsQuery = trpc.content.searchPosts.useInfiniteQuery(
        { 
            query, 
            sort: activeTab === "top" ? "top" : "latest",
            onlyMedia: activeTab === "media"
        },
        { 
            enabled: activeTab !== "people" && activeTab !== "lists" && query.length > 0,
            getNextPageParam: (lastPage) => lastPage.nextCursor 
        }
    );

    const usersQuery = trpc.user.search.useQuery(
        { query },
        { enabled: activeTab === "people" && query.length > 0 }
    );

    const isLoading = activeTab === "people" ? usersQuery.isLoading : postsQuery.isLoading;
    const isError = activeTab === "people" ? usersQuery.isError : postsQuery.isError;

    const renderContent = () => {
        if (!query) {
            return (
                <div className="flex flex-col h-screen items-center justify-center px-4 text-center">
                    <p className="text-postgray">Enter a search term to find posts, people, and more.</p>
                </div>
            );
        }

        if (isLoading) {
            return (
                <div className="divide-y divide-border/40">
                    {[...Array(8)].map((_, i) => (
                        <PostCardSkeleton key={i} />
                    ))}
                </div>
            );
        }

        if (activeTab === "people") {
            const users = usersQuery.data?.users ?? [];
            if (users.length === 0) return <EmptyState />;
            return (
                <div className="divide-y divide-border/40">
                    {users.map((user) => (
                        <UserResultCard 
                            key={user.id} 
                            user={user as any} 
                            initialIsFollowing={(user as any).isFollowing}
                        />
                    ))}
                </div>
            );
        }

        const posts = postsQuery.data?.pages.flatMap((p) => (p as any).posts) ?? [];
        if (posts.length === 0) return <EmptyState />;

        return (
            <div className="divide-y divide-border/40">
                {posts.map((post) => (
                    <PostCard key={post.id} post={post as any} />
                ))}
                
                {postsQuery.hasNextPage && (
                    <div className="p-4 flex justify-center">
                        <button
                            onClick={() => postsQuery.fetchNextPage()}
                            disabled={postsQuery.isFetchingNextPage}
                            className="text-sm text-primary hover:underline flex items-center gap-2"
                        >
                            {postsQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                            Load more
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col min-h-screen bg-background">
            {/* Tab Bar */}
            <div className="sticky top-[52px] z-20 bg-background/80 backdrop-blur-md border-b border-border/40">
                <div className="flex overflow-x-auto scrollbar-none no-scrollbar px-1">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative cursor-pointer flex-1 min-w-[80px] py-4 text-md font-bold transition-colors ${
                                    isActive ? "text-foreground " : "text-postgray hover:text-postgray"
                                }`}
                            >
                                {tab.label}
                                {isActive && (
                                    <motion.div
                                        layoutId="search-tab-indicator"
                                        className="absolute bottom-0 left-0 right-0 h-[3px] bg-twitter2 rounded-full mx-4"
                                        transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Results */}
            <main className="flex-1">
                <div>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <h3 className="text-lg font-semibold mb-2 text-postgray">No results found</h3>
            <p className="text-postgray">Try searching for something else or check your spelling.</p>
        </div>
    );
}
