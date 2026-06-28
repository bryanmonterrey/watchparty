"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryCard } from "@/components/categories/category-card";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";

// Discovery shown on the search page while the query is empty — one responsive
// layout for mobile and desktop (replaces the old mobile-only search home and
// the bare desktop empty state). "Live now" horizontal rail + a preview of the
// categories grid that links through to the full /category index.

interface FeedVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

function LiveCard({ v }: { v: FeedVideo }) {
    return (
        <Link href={`/${v.user.username}/${v.id}`} className="w-44 shrink-0 snap-start md:w-52">
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
                <span className="absolute left-2 top-2 rounded-md bg-red2 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Live
                </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-semibold">{v.user.username ?? v.title}</p>
        </Link>
    );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
    return (
        <div className="flex items-baseline justify-between px-5 pb-3 md:px-8">
            <h2 className="text-[22px] font-extrabold tracking-tight">{title}</h2>
            {href && (
                <Link href={href} className="text-sm font-semibold text-blue-500 hover:underline">
                    See all
                </Link>
            )}
        </div>
    );
}

export function SearchLanding() {
    const live = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 10, category: "Live" },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const liveVideos = (live.data?.pages.flatMap((p) => p.videos) ?? []) as FeedVideo[];
    const previewCategories = HOME_CATEGORIES.slice(0, 12);

    return (
        <div className="flex flex-col gap-10 pb-12">
            <section>
                <SectionHeader title="Live now" />
                {live.isLoading ? (
                    <div className="flex gap-4 px-5 md:px-8">
                        <Skeleton className="aspect-square w-44 rounded-xl md:w-52" />
                        <Skeleton className="aspect-square w-44 rounded-xl md:w-52" />
                        <Skeleton className="hidden aspect-square w-52 rounded-xl md:block" />
                    </div>
                ) : liveVideos.length === 0 ? (
                    <p className="px-5 text-sm text-muted-foreground md:px-8">No one is live right now.</p>
                ) : (
                    <div className="hidden-scrollbar flex snap-x gap-4 overflow-x-auto px-5 md:px-8">
                        {liveVideos.map((v) => (
                            <LiveCard key={v.id} v={v} />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <SectionHeader title="Browse categories" href="/category" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-5 sm:grid-cols-3 md:grid-cols-4 md:px-8 lg:grid-cols-6">
                    {previewCategories.map((c, i) => (
                        <CategoryCard
                            key={c.slug}
                            c={c}
                            index={i}
                            count={previewCategories.length}
                            className="w-full shrink"
                        />
                    ))}
                </div>
            </section>
        </div>
    );
}
