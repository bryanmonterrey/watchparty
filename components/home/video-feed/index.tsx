"use client"

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryState } from "nuqs";
import { trpc } from "@/lib/trpc/client";
import { CategoryList } from "./category-list";
import { VideoCard } from "./video-card";
import { searchParams } from "@/lib/searchParams";
import { AnimatePresence, motion } from "framer-motion";

export function VideoFeed() {
    const [activeTab, setActiveTab] = useState("All");
    const [q, setQ] = useQueryState("q", searchParams.q);
    const [inputValue, setInputValue] = useState(q);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const category = activeTab === "All" ? undefined : activeTab;

    const {
        data,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 12, category },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            initialCursor: undefined,
        }
    );

    const allVideos = data?.pages.flatMap((p) => p.videos) ?? [];

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Infinite scroll via IntersectionObserver
    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) handleLoadMore(); },
            { rootMargin: "200px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [handleLoadMore]);

    // Sync URL → input when URL changes externally (e.g. back/forward)
    useEffect(() => {
        setInputValue(q);
    }, [q]);

    // Debounce input → URL (replace, not push, so typing doesn't pollute history)
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (inputValue !== q) {
                setQ(inputValue || null);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [inputValue, q, setQ]);


    return (
        <div className="w-full pb-20">
            {/* STICKY GLASS HEADER */}
            <div className="sticky top-0 z-30 w-full flex flex-col backdrop-blur-xl bg-black/40 pt-2 pb-2 px-1 space-y-3 relative">
                {/* SEARCH BAR SPACER */}
                <div className="w-full h-[52px] pointer-events-none" />
                <CategoryList activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 bg-black sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <VideoCard key={i} loading />
                    ))}
                </div>
            ) : allVideos.length === 0 ? (
                <div className="flex flex-col bg-black items-center justify-center py-20 text-zinc-500">
                    <p className="text-sm font-medium">No videos yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 bg-black sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {allVideos.map((video) => (
                        <VideoCard key={video.id} video={video as any} />
                    ))}
                    {isFetchingNextPage &&
                        Array.from({ length: 3 }).map((_, i) => (
                            <VideoCard key={`skeleton-${i}`} loading />
                        ))
                    }
                </div>
            )}
            <div ref={loadMoreRef} className="h-1" />
        </div>
    );
}
