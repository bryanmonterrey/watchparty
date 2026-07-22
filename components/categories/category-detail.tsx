"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import type { HomeCategory } from "@/lib/data/home-categories";

interface FeedVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    views?: number | null;
    isLive?: boolean | null;
    user: { username: string | null; avatar_url: string | null };
}

function compact(n: number) {
    return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

function VideoTile({ v }: { v: FeedVideo }) {
    return (
        <Link href={`/${v.user.username}/${v.id}`} className="group block">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                {v.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        loading="lazy"
                        className="size-full object-cover"
                    />
                )}
                {v.isLive && (
                    <span className="absolute left-2 top-2 rounded-md bg-red2 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        Live
                    </span>
                )}
            </div>
            <div className="mt-2 flex gap-3">
                <span className="mt-0.5 size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {v.user.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                    )}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{v.title}</p>
                    <p className="truncate text-xs text-muted-foreground">@{v.user.username}</p>
                    {typeof v.views === "number" && (
                        <p className="text-xs text-muted-foreground">{compact(v.views)} views</p>
                    )}
                </div>
            </div>
        </Link>
    );
}

export function CategoryDetail({ category }: { category: HomeCategory }) {
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.content.getVideoFeed.useInfiniteQuery(
            { limit: 24, category: category.title },
            { getNextPageParam: (p) => p.nextCursor }
        );

    const videos = (data?.pages.flatMap((p) => p.videos) ?? []) as FeedVideo[];

    return (
        <div className="w-full px-5 pt-20 pb-16 md:px-8 md:pt-24">
            {/* Header: box art + title + tags */}
            <div className="mb-8 flex items-end gap-4 md:gap-5">
                <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-xl bg-muted md:w-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={category.thumbnailUrl} alt={category.title} className="size-full object-cover" />
                </div>
                <div className="min-w-0 pb-1">
                    <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{category.title}</h1>
                    {category.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {category.tags.map((t) => (
                                <span
                                    key={t}
                                    className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i}>
                            <div className="aspect-video rounded-xl bg-zinc-800" style={staggerPulse(i, 8)} />
                            <div className="mt-2 h-4 w-3/4 rounded bg-zinc-800" style={staggerPulse(i, 8)} />
                        </div>
                    ))}
                </div>
            ) : videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                    <p className="text-base font-semibold text-foreground">Nothing here yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        No one is streaming {category.title} right now. Check back soon or explore another category.
                    </p>
                    <Link
                        href="/category"
                        className="mt-1 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                    >
                        Browse categories
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {videos.map((v) => (
                            <VideoTile key={v.id} v={v} />
                        ))}
                    </div>
                    {hasNextPage && (
                        <div className="mt-8 flex justify-center">
                            <button
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className={cn(
                                    "rounded-full bg-card px-5 py-2 text-sm font-semibold ring-1 ring-border transition-colors hover:bg-muted",
                                    isFetchingNextPage && "opacity-60"
                                )}
                            >
                                {isFetchingNextPage ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
