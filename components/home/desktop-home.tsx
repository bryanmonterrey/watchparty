"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES } from "./video-feed/types";
import { HomeCarousel, HomeCarouselSkeleton } from "./home-carousel";

// Desktop home per desktopdesigns/homepage.svg: full-bleed hero carousel,
// then Trending / Categories / IRL sections. Same feed procedures as before —
// only the presentation changed (the old endless-grid VideoFeed is retired
// from this page).

interface FeedVideo {
    id: string;
    title: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

function watchHref(v: FeedVideo) {
    return `/${v.user.username}/${v.id}`;
}

function SectionHeader({ title, href }: { title: string; href: string }) {
    return (
        <div className="flex items-baseline justify-between pb-4">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <Link href={href} className="text-sm font-extrabold text-zinc-300/60 hover:text-white/80">
                View all
            </Link>
        </div>
    );
}

function VideoCard({ v }: { v: FeedVideo }) {
    return (
        <Link href={watchHref(v)} className="group relative block overflow-hidden rounded-2xl bg-muted">
            <div className="aspect-video w-full">
                {v.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="size-full object-cover transition-transform duration-300"
                        loading="lazy"
                    />
                )}
            </div>
            <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-xl bg-black/55 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
                {v.title}
            </span>
        </Link>
    );
}

function CardRowSkeleton() {
    return (
        <div className="grid grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-2xl" />
            ))}
        </div>
    );
}

export function DesktopHome() {
    const feed = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 28 },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const irl = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 4, category: "IRL" },
        { getNextPageParam: (p) => p.nextCursor }
    );

    const videos = feed.data?.pages.flatMap((p) => p.videos) ?? [];
    const heroVideos = videos.slice(0, 24);
    const trendingVideos = videos.slice(24, 28);
    const irlVideos = irl.data?.pages.flatMap((p) => p.videos) ?? [];
    const browseCategories = CATEGORIES.filter(
        (c) => !["All", "Trending", "For You", "New"].includes(c)
    );

    return (
        <div className="flex flex-col gap-10 pb-16 md:pt-[var(--header-height)]">
            {/* ── Hero carousel: full-bleed coverflow accordion ──────────── */}
            {feed.isLoading ? <HomeCarouselSkeleton /> : <HomeCarousel videos={heroVideos} />}

            <div className="flex flex-col gap-10 px-6">
                <section>
                    <SectionHeader title="Trending" href="/search" />
                    {feed.isLoading ? (
                        <CardRowSkeleton />
                    ) : (
                        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                            {(trendingVideos.length ? trendingVideos : heroVideos.slice(0, 4)).map((v) => (
                                <VideoCard key={v.id} v={v} />
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <SectionHeader title="Categories" href="/search" />
                    <div className="hidden-scrollbar flex gap-4 overflow-x-auto">
                        {browseCategories.map((c) => (
                            <Link
                                key={c}
                                href={`/search?q=${encodeURIComponent(c)}`}
                                className="flex aspect-square w-40 shrink-0 items-end rounded-2xl bg-muted p-3 transition-colors hover:bg-muted-foreground/20"
                            >
                                <span className="text-base font-extrabold">{c}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section>
                    <SectionHeader title="IRL" href="/search?q=IRL" />
                    {irl.isLoading ? (
                        <CardRowSkeleton />
                    ) : irlVideos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No IRL streams yet.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                            {irlVideos.slice(0, 4).map((v) => (
                                <VideoCard key={v.id} v={v} />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
