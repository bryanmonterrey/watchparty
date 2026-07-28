"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { CATEGORIES } from "./video-feed/types";

// Minimal shape this view reads — the feed procedure returns richer rows
// whose exact type varies per feed branch.
interface FeedVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

// Mobile home from "public/mobile designs/home mobile landing..svg":
// stacked sections (Trending, IRL, Categories), each a horizontal scroll row
// with a "View all" link. Rendered only below md (see app/(app)/home/page.tsx).

function SectionHeader({ title, href }: { title: string; href: string }) {
    return (
        <div className="flex items-baseline justify-between px-5 pb-3">
            <h2 className="text-[22px] font-extrabold tracking-tight">{title}</h2>
            <Link href={href} className="text-sm font-medium text-blue-500">
                View all
            </Link>
        </div>
    );
}

function VideoRow({ videos, isLoading }: { videos: FeedVideo[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex gap-4 overflow-x-hidden px-5">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        style={staggerPulse(i, 3)}
                        className="aspect-video w-[320px] shrink-0 rounded-xl"
                    />
                ))}
            </div>
        );
    }
    if (videos.length === 0) {
        return <p className="px-5 text-sm text-muted-foreground">Nothing here yet.</p>;
    }
    return (
        <div className="hidden-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5">
            {videos.map((v) => (
                <Link
                    key={v.id}
                    href={`/video/${v.id}`}
                    className="w-[320px] shrink-0 snap-start"
                >
                    <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                        {v.thumbnailUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnailUrl} alt={v.title} className="size-full object-cover" loading="lazy" />
                        )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="size-6 shrink-0 overflow-hidden rounded-full bg-muted">
                            {v.user.avatar_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                            )}
                        </span>
                        <p className="truncate text-sm font-semibold">{v.title}</p>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export function MobileHome() {
    const trending = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 8 },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const irl = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 8, category: "IRL" },
        { getNextPageParam: (p) => p.nextCursor }
    );

    const trendingVideos = trending.data?.pages.flatMap((p) => p.videos) ?? [];
    const irlVideos = irl.data?.pages.flatMap((p) => p.videos) ?? [];
    const browseCategories = CATEGORIES.filter(
        (c) => !["All", "Trending", "For You", "New"].includes(c)
    );

    return (
        <div className="flex flex-col gap-8 pt-20">
            <section>
                <SectionHeader title="Trending" href="/search" />
                <VideoRow videos={trendingVideos} isLoading={trending.isLoading} />
            </section>

            <section>
                <SectionHeader title="IRL" href="/search" />
                <VideoRow videos={irlVideos} isLoading={irl.isLoading} />
            </section>

            <section>
                <SectionHeader title="Categories" href="/search" />
                <div className="hidden-scrollbar flex gap-3 overflow-x-auto px-5">
                    {browseCategories.map((c) => (
                        <Link
                            key={c}
                            href={`/search?q=${encodeURIComponent(c)}`}
                            className="flex aspect-[3/4] w-28 shrink-0 items-end rounded-xl bg-muted p-2"
                        >
                            <span className="text-sm font-bold">{c}</span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
