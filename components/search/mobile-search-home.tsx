"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES } from "@/components/home/video-feed/types";

// Mobile search landing from "public/mobile designs/Search Page mobile
// landing.svg": Live + Categories rows shown while the query is empty.
// The design also has a "Following" section (followed channels) — pending a
// followed-streams procedure; add it when the router grows one.

interface FeedVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

function SquareCard({ v }: { v: FeedVideo }) {
    return (
        <Link href={`/${v.user.username}/${v.id}`} className="w-44 shrink-0 snap-start">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                {v.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl} alt={v.title} className="size-full object-cover" loading="lazy" />
                )}
                <span className="absolute inset-0 m-auto size-16 overflow-hidden rounded-full bg-pastelred ring-2 ring-card">
                    {v.user.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                    )}
                </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-semibold">{v.user.username ?? v.title}</p>
        </Link>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="flex items-baseline justify-between px-5 pb-3">
                <h2 className="text-[22px] font-extrabold tracking-tight">{title}</h2>
                <span className="text-sm font-medium text-blue-500">View all</span>
            </div>
            {children}
        </section>
    );
}

export function MobileSearchHome() {
    const live = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 8, category: "Live" },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const liveVideos = live.data?.pages.flatMap((p) => p.videos) ?? [];
    const browseCategories = CATEGORIES.filter(
        (c) => !["All", "Trending", "For You", "New"].includes(c)
    );

    return (
        <div className="flex flex-col gap-8">
            <Section title="Live">
                {live.isLoading ? (
                    <div className="flex gap-4 px-5">
                        <Skeleton className="aspect-square w-44 rounded-xl" />
                        <Skeleton className="aspect-square w-44 rounded-xl" />
                    </div>
                ) : liveVideos.length === 0 ? (
                    <p className="px-5 text-sm text-muted-foreground">No one is live right now.</p>
                ) : (
                    <div className="hidden-scrollbar flex snap-x gap-4 overflow-x-auto px-5">
                        {liveVideos.map((v) => <SquareCard key={v.id} v={v} />)}
                    </div>
                )}
            </Section>

            <Section title="Categories">
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
            </Section>
        </div>
    );
}
