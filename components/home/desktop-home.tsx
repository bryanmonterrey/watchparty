"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import { HomeCarousel, HomeCarouselSkeleton } from "./home-carousel";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";
import { CategoryCard } from "@/components/categories/category-card";
import {
    TrendingVideoCard as VideoCard,
    TrendingVideoCardSkeleton as VideoCardSkeleton,
    type FeedVideo,
} from "./trending-video-card";

// Desktop home per desktopdesigns/homepage.svg: full-bleed hero carousel,
// then Trending / Categories / IRL sections. Same feed procedures as before —
// only the presentation changed (the old endless-grid VideoFeed is retired
// from this page).

function SectionHeader({ title, href }: { title: string; href: string }) {
    return (
        <div className="flex items-baseline justify-between pb-4">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <Link href={href} className="text-sm font-extrabold text-ring hover:text-twitter2">
                View all
            </Link>
        </div>
    );
}

// Skeleton row: four TrendingVideoCardSkeletons sharing one stagger cycle.
const TRENDING_SKELETON_COUNT = 4;

function CardRowSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            {Array.from({ length: TRENDING_SKELETON_COUNT }).map((_, i) => (
                <VideoCardSkeleton key={i} index={i} count={TRENDING_SKELETON_COUNT} />
            ))}
        </div>
    );
}

// Category tile: artwork on top with a staggered pulse placeholder that fades
// to the image once it loads, then the title and tag badges below it.
// CategoryCard now lives in components/categories/category-card.tsx (shared
// with the /category index and the search landing).

// Full-height edge control, matching the hero carousel's arrows: a flat
// black/blurred bar that fades in on carousel hover (not a rounded button).
function EdgeArrow({ side, onClick, insetClass = "inset-y-0" }: { side: "left" | "right"; onClick: () => void; insetClass?: string }) {
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={side === "left" ? "Scroll left" : "Scroll right"}
            className={cn(
                "group/arrow absolute z-20 flex w-16 items-center bg-black/50 backdrop-blur-xs opacity-0 transition-opacity duration-300 group-hover/trend:opacity-100",
                insetClass,
                side === "left" ? "left-0 justify-start pl-2" : "right-0 justify-end pr-2"
            )}
        >
            <Icon
                className="size-8 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110"
                strokeWidth={2.5}
            />
        </button>
    );
}

// Draggable embla carousel (drag-to-scroll like the hero, native momentum on
// touch) with hero-style edge arrows that hide when you can't scroll that way.
// Shared by the Trending and Categories rows.
function ArrowCarousel({ contentClassName, arrowInset, children }: { contentClassName?: string; arrowInset?: string; children: React.ReactNode }) {
    const [api, setApi] = useState<CarouselApi>();
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    useEffect(() => {
        if (!api) return;
        const update = () => {
            setCanPrev(api.canScrollPrev());
            setCanNext(api.canScrollNext());
        };
        update();
        api.on("select", update);
        api.on("reInit", update);
        return () => {
            api.off("select", update);
            api.off("reInit", update);
        };
    }, [api]);

    return (
        <Carousel
            setApi={setApi}
            opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
            className="group/trend"
        >
            <CarouselContent className={contentClassName}>{children}</CarouselContent>
            {canPrev && <EdgeArrow side="left" insetClass={arrowInset} onClick={() => api?.scrollPrev()} />}
            {canNext && <EdgeArrow side="right" insetClass={arrowInset} onClick={() => api?.scrollNext()} />}
        </Carousel>
    );
}

// Trending row: the draggable arrow carousel plus a ghost "Show all / Show
// less" toggle that swaps it for a 12-video grid.
function TrendingCarousel({ videos }: { videos: FeedVideo[] }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="flex flex-col gap-4">
            {expanded ? (
                <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                    {videos.map((v) => (
                        <VideoCard key={v.id} v={v} />
                    ))}
                </div>
            ) : (
                // py-3 gives the cards' hover backdrop room before the embla
                // viewport clips it vertically.
                <ArrowCarousel contentClassName="-ml-5 py-3" arrowInset="inset-y-3">
                    {videos.map((v) => (
                        <CarouselItem key={v.id} className="basis-1/2 pl-5 xl:basis-1/4">
                            <VideoCard v={v} />
                        </CarouselItem>
                    ))}
                </ArrowCarousel>
            )}
            <div className="flex justify-center">
                <Button
                    variant="ghost"
                    onClick={() => setExpanded((e) => !e)}
                    className="text-sm font-extrabold text-vice-purple/85 hover:bg-transparent hover:text-vice-purple"
                >
                    {expanded ? "Show less" : "Show all"}
                </Button>
            </div>
        </div>
    );
}

export function DesktopHome() {
    const feed = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 36 },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const irl = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 4, category: "IRL" },
        { getNextPageParam: (p) => p.nextCursor }
    );

    // Dedupe by video id: a repost and its original share the same `id` (they
    // render the same video), differing only by `feedKey`. Without this, a
    // reposted video shows up twice in the hero/trending rows and collides on
    // the carousels' `key={v.id}`. Keep the first occurrence.
    const videos = [
        ...new Map(
            (feed.data?.pages.flatMap((p) => p.videos) ?? []).map((v) => [v.id, v]),
        ).values(),
    ];
    const heroVideos = videos.slice(0, 24);
    // 12 trending videos after the hero set; fall back to the first 12 when the
    // feed is too short to fill both.
    const trendingTail = videos.slice(24, 36);
    const trendingVideos = trendingTail.length ? trendingTail : videos.slice(0, 12);
    const irlVideos = [
        ...new Map(
            (irl.data?.pages.flatMap((p) => p.videos) ?? []).map((v) => [v.id, v]),
        ).values(),
    ];

    return (
        <div className="flex flex-col gap-7 pb-16 md:pt-[var(--header-height)]">
            {/* ── Hero carousel: full-bleed coverflow accordion ──────────── */}
            <div className="pt-4">
                {feed.isLoading ? <HomeCarouselSkeleton /> : <HomeCarousel videos={heroVideos} />}
            </div>

            <div className="flex flex-col gap-7 px-6">
                <section>
                    <SectionHeader title="Trending" href="/search" />
                    {feed.isLoading ? (
                        <CardRowSkeleton />
                    ) : (
                        <TrendingCarousel videos={trendingVideos} />
                    )}
                </section>

                <section>
                    <SectionHeader title="Categories" href="/category" />
                    <ArrowCarousel contentClassName="items-start">
                        {HOME_CATEGORIES.map((c, i) => (
                            <CarouselItem key={c.slug} className="basis-auto">
                                <CategoryCard c={c} index={i} count={HOME_CATEGORIES.length} />
                            </CarouselItem>
                        ))}
                    </ArrowCarousel>
                </section>

                {/* Hide the whole section when it resolves empty — only show the
                    header/skeleton while loading or once there are streams. */}
                {(irl.isLoading || irlVideos.length > 0) && (
                    <section>
                        <SectionHeader title="IRL" href="/search?q=IRL" />
                        {irl.isLoading ? (
                            <CardRowSkeleton />
                        ) : (
                            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                                {irlVideos.slice(0, 4).map((v) => (
                                    <VideoCard key={v.id} v={v} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
