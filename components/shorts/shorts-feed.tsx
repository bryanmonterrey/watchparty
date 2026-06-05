"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { ShortVideoCard } from "./short-video-card";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";

export function ShortsFeed() {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading
    } = trpc.content.getShortsFeed.useInfiniteQuery(
        { limit: 5 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

    const videos = data?.pages.flatMap((page) => page.shorts) || [];

    // Intersection Observer to detect the active video
    useEffect(() => {
        const observerOptions = {
            root: scrollContainerRef.current,
            rootMargin: "0px",
            threshold: 0.6 // Trigger when 60% of the video is visible
        };

        const observerCallback: IntersectionObserverCallback = (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const videoId = entry.target.getAttribute("data-video-id");
                    if (videoId && videoId !== activeVideoId) {
                        setActiveVideoId(videoId);
                    }
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        // Disconnect and reconnect to observe newly added elements
        observer.disconnect();
        const videoElements = document.querySelectorAll(".short-video-container");
        videoElements.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, [videos.length]); // Re-bind observer when new videos load

    // Infinite scroll trigger
    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // If within 800px of bottom, fetch more
        if (scrollHeight - scrollTop - clientHeight < 800 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    if (videos.length === 0 && !isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black2">
                <p className="text-zinc-500">No shorts available yet.</p>
            </div>
        );
    }

    // Set first video as active initially if none is set
    if (!activeVideoId && videos.length > 0) {
        setActiveVideoId(videos[0].id);
    }

    const scrollNext = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ top: scrollContainerRef.current.clientHeight, behavior: "smooth" });
        }
    };

    const scrollPrev = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ top: -scrollContainerRef.current.clientHeight, behavior: "smooth" });
        }
    };

    if (isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center gap-4 py-2 px-4 relative bg-black2">
                <div className="absolute inset-0 bg-black2" />
                <div className="relative z-10 h-full aspect-[9/16] flex-shrink-0 sm:rounded-2xl overflow-hidden bg-zinc-900/60">
                    <Skeleton name="shorts-video" loading>
                        <div className="w-full h-full bg-zinc-800/20" />
                    </Skeleton>
                    <div className="absolute bottom-0 left-0 w-full p-4 pt-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end gap-2">
                        <Skeleton name="shorts-title" loading>
                            <div className="h-4 w-32 rounded-full bg-zinc-700/30" />
                        </Skeleton>
                        <Skeleton name="shorts-desc" loading>
                            <div className="h-4 w-48 rounded-full bg-zinc-700/30" />
                        </Skeleton>
                        <Skeleton name="shorts-meta" loading>
                            <div className="h-4 w-36 rounded-full bg-zinc-700/30" />
                        </Skeleton>
                    </div>
                </div>
                <div className="relative z-20 flex flex-col gap-3 items-center justify-end h-full pb-4 shrink-0 px-2 lg:px-4">
                    <Skeleton name="shorts-avatar" loading>
                        <div className="w-14 h-14 rounded-full bg-zinc-800" />
                    </Skeleton>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                            <Skeleton name="shorts-action" loading>
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800" />
                            </Skeleton>
                            <Skeleton name="shorts-count" loading>
                                <div className="h-2.5 w-8 rounded-full bg-zinc-700/30" />
                            </Skeleton>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative group">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="w-full h-full overflow-y-scroll snap-y snap-mandatory hidden-scrollbar relative bg-black2"
            >
                {videos.map((video) => (
                    <div
                        key={video.id}
                        data-video-id={video.id}
                        className="short-video-container snap-start snap-always w-full h-full relative bg-black2 [contain:none] overflow-visible"
                    >
                        <ShortVideoCard
                            video={video}
                            isActive={activeVideoId === video.id}
                        />
                    </div>
                ))}

                {isFetchingNextPage && (
                    <div className="short-video-container snap-start snap-always w-full h-full relative flex items-center justify-center">
                        <div className="text-zinc-500 text-sm">Loading more...</div>
                    </div>
                )}
            </div>

            {/* Desktop Up/Down Navigation Buttons */}
            <div className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 flex-col gap-3 z-50">
                <Button
                    variant="secondary"
                    size="icon"
                    onClick={scrollPrev}
                    className="w-16 h-16 bg-zinc-900 backdrop-blur-md hover:bg-zinc-800/80 text-white glass-ring rounded-2xl shadow-lg"
                >
                    <ChevronUp className="!w-10 !h-10" />
                </Button>
                <Button
                    variant="secondary"
                    size="icon"
                    onClick={scrollNext}
                    className="w-16 h-16 bg-zinc-900 backdrop-blur-md hover:bg-zinc-800/80 text-white glass-ring rounded-2xl shadow-lg"
                >
                    <ChevronDown className="!w-10 !h-10" />
                </Button>
            </div>
        </div>
    );
}
