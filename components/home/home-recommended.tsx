"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useStuck } from "@/hooks/use-stuck";
import { useForceLoading } from "@/lib/debug-loading";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";
import { TrendingVideoCard, type FeedVideo } from "./trending-video-card";
import { HomeRecommendedSkeleton } from "./home-recommended-skeleton";

// Home's Recommended tab: the video feed sliced into titled 2×3 grids of the
// trending video card (the desktop-home carousel card, extracted to
// trending-video-card.tsx).
//
// One ranked query, not one per category. getVideoFeed already runs the feed
// through Phoenix for signed-in users, so its order IS the recommendation —
// the first six become "For You", and the rest fall into a section per
// category in the order the ranker first surfaced each one. A query per
// category would re-rank each slice in isolation and fire N requests to fill
// a column the single feed already covers.
//
// Section titles stick at --board-stick (home supplies it: directly under the
// pinned category tabs), each within its own <section> — so the incoming
// category title replaces the previous one at the pin line as you scroll,
// which is the whole gesture of the tab.

// 2 columns × 3 rows.
const SECTION_SIZE = 6;

interface Section {
    /** Stable per-category key; "for-you" for the lead section. */
    key: string;
    title: string;
    /** View-all destination — /category/<slug> when the title matches the
     * catalog, /search otherwise. Absent on For You (it IS the whole feed). */
    href?: string;
    videos: FeedVideo[];
}

function buildSections(videos: FeedVideo[]): Section[] {
    const sections: Section[] = [];
    if (videos.length) {
        sections.push({ key: "for-you", title: "For You", videos: videos.slice(0, SECTION_SIZE) });
    }

    // Group everything past the For You six by category, first-appearance
    // order (i.e. ranked order — the category whose video the ranker placed
    // highest leads). Case-insensitive: posts.category is creator-entered
    // free text, same reason getVideoFeed matches it with lower().
    const byCategory = new Map<string, Section>();
    for (const v of videos.slice(SECTION_SIZE)) {
        const raw = v.category?.trim();
        if (!raw) continue;
        const key = raw.toLowerCase();
        let section = byCategory.get(key);
        if (!section) {
            const canonical = HOME_CATEGORIES.find((c) => c.title.toLowerCase() === key);
            section = {
                key,
                title: canonical?.title ?? raw,
                href: canonical?.slug ?? `/search?q=${encodeURIComponent(canonical?.title ?? raw)}`,
                videos: [],
            };
            byCategory.set(key, section);
        }
        if (section.videos.length < SECTION_SIZE) section.videos.push(v);
    }
    sections.push(...byCategory.values());
    return sections;
}

function RecommendedSection({ section }: { section: Section }) {
    // Canvas fill only while the title is actually pinned — unstuck it sits on
    // the bare canvas with the hero glow spilling over it, same deal as the
    // category tabs above (see home-category-panel).
    const { sentinelRef, stuck } = useStuck();

    return (
        <section>
            {/* h-px, not h-0: a zero-area target is an unreliable
                IntersectionObserver subject; -mb-px cancels the layout cost. */}
            <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
            <div
                className={cn(
                    // z-10: over the cards (isolate z-0) and their hover
                    // backdrops, under the tabs bar (z-15). pb-3 is painted by
                    // the fill, so no transparent slot shows rows while stuck.
                    "sticky top-[var(--board-stick,0px)] z-10 flex items-baseline justify-between pb-3 transition-colors duration-300",
                    stuck && "bg-canvas duration-0",
                )}
            >
                <h2 className="text-xl font-semibold tracking-tight text-flexwhite">{section.title}</h2>
                {section.href && (
                    <Link href={section.href} className="text-sm font-extrabold text-ring hover:text-twitter2">
                        View all
                    </Link>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-7 pb-8">
                {section.videos.map((v) => (
                    <TrendingVideoCard key={v.id} v={v} />
                ))}
            </div>
        </section>
    );
}

export function HomeRecommended() {
    const forceLoading = useForceLoading();
    const feed = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 24 },
        { getNextPageParam: (p) => p.nextCursor },
    );

    // Dedupe by video id — a repost and its original share the id and would
    // collide on key={v.id} (same guard as desktop-home / the rail).
    const videos = useMemo(
        () => [
            ...new Map(
                (feed.data?.pages.flatMap((p) => p.videos) ?? []).map((v) => [v.id, v]),
            ).values(),
        ],
        [feed.data],
    );
    const sections = useMemo(() => buildSections(videos), [videos]);

    // Endless: pull the next page as the tail approaches the viewport, so
    // scrolling keeps producing category sections without a button.
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
            },
            { rootMargin: "600px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    if (feed.isLoading || forceLoading) return <HomeRecommendedSkeleton />;

    if (!videos.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <p className="text-sm font-medium">No videos yet</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col pb-8">
            {sections.map((section) => (
                <RecommendedSection key={section.key} section={section} />
            ))}
            {isFetchingNextPage && <HomeRecommendedSkeleton />}
            <div ref={loadMoreRef} aria-hidden className="h-px" />
        </div>
    );
}
