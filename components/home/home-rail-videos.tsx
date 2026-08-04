"use client";

import { useEffect, useRef } from "react";
import { RailRow, RailRowSkeleton } from "@/components/rails/rail-row";
import { RailShell } from "@/components/rails/rail-shell";
import { RailScrollbar } from "@/components/rails/rail-scrollbar";
import { HOME_TAB_LIKED } from "@/components/rails/rail-tabs";
import { HomeRailTabs } from "./home-rail-tabs";
import { cn } from "@/lib/utils";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { useHomeFeed } from "./home-feed-context";
import { HomeRailRowMenu } from "./home-rail-row-menu";

// The rail's video list — this is the carousel's picker, relocated. Clicking a
// row makes it the hero, exactly as clicking a cell in the old 3x3 grid did.
//
// The row itself is components/rails/rail-row.tsx, shared with the video and
// live rails so the three can't drift apart. This one passes onSelect instead
// of href: it's the only rail that picks rather than navigates.
const SKELETON_COUNT = 5;
// Rows appended per page — enough to cover the sentinel's lead so the list
// never visibly stops while the next page lands.
const LOADING_MORE_ROWS = 3;
// How far ahead of the bottom the next page starts loading. Roughly three rows,
// so scrolling at a normal speed never reaches an empty end.
const PREFETCH_MARGIN = "400px";

// ── Card spacing ────────────────────────────────────────────────────────────
// Shared by the real list and the skeleton so the two can't drift — the whole
// point of the skeleton wearing the real chrome is that nothing shifts when the
// rows arrive.
//
// px-2 insets the content off the outline. RailRow already carries its own p-2
// and its own squircled hover fill, so without this the fill ran into the
// card's border on both edges; with it the rows sit inside the box.
//
// mb-0. The 80px that used to sit here as mb-20 moved OUT of the card and off
// the box's height (see RAIL_INNER in home-page-surface), because as a margin
// here it was also the gap down to the news card — and that gap should be the
// feed's 18px, not 80px. The card measures the same as it did either way: its
// height is the box minus the top padding minus this margin, and the box shrank
// by exactly what this margin gave up.
const CARD_PX = "px-2";
const CARD_MB = "mb-0";
// The TABS' own box, deliberately not the same inset as the rows below them.
// px-3 sets them in a notch further than the scroller's px-2, and pb-2 is the
// gap down to the first row — the tabs used to sit on pt-2.5 with nothing under
// them, so the list started immediately beneath the labels.
//
// RailTabs itself is a bare <nav> with no padding of its own, so these are the
// only values in play; nothing here doubles up.
// EXPERIMENT: bg-canvas/50 + backdrop-blur-xs on the tab strip, to see how a
// translucent band reads against the card's flat fill. Applied here rather than
// on RailTabs itself, which the live/video rails also use — this keeps it to
// home's rail. Revert = drop the last two classes.
const CARD_HEADER_PAD = "px-3 pt-3 pb-2 bg-canvas/50 backdrop-blur-xs";



export function HomeRailVideos() {
    // On Liked the feed itself is filtered server-side (see home-feed-context),
    // so this list is just whatever the query returned — no sieving here.
    const { videos, active, setActiveId, isLoading, hasMore, isLoadingMore, loadMore, tab } = useHomeFeed();
    const onLiked = tab === HOME_TAB_LIKED;

    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // One header for both branches below, so the skeleton and the real list
    // present an identical card.
    const cardHeader = (
        <div className={CARD_HEADER_PAD}>
            <HomeRailTabs />
        </div>
    );

    // Infinite scroll. The observer's root is the rail itself, not the viewport:
    // this list scrolls inside a fixed-height sticky column, so a viewport-rooted
    // observer would never see the sentinel move.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) loadMore();
            },
            { root: scrollRef.current, rootMargin: PREFETCH_MARGIN },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadMore]);

    // THE CARD. Same anatomy as the alerts rail's: radius 25, outlined, and the
    // tabs handed in as `header` so they sit INSIDE the one outline rather than
    // above it. That last part is the whole trick — RailShell's header prop
    // exists because Lisse strokes a whole path with no per-side control, so two
    // bordered boxes that meet draw two hairlines and the seam can't be removed
    // from the outside. One Squircle with the tabs inside has no internal edge.
    //
    // The tabs used to be a loose sibling in home-page-surface, above the shell
    // and separated by a gap-2; they belong to this list, so they move in here
    // with it.
    //
    // The skeleton wears the same shell as the real list — a container that
    // appears only once the rows land would read as a layout shift.
    if (isLoading) {
        return (
            <RailShell className={CARD_MB} radius={25} bordered header={cardHeader}>
                <div className={cn("flex flex-col", CARD_PX)}>
                    {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                        <RailRowSkeleton key={i} index={i} count={SKELETON_COUNT} />
                    ))}
                </div>
            </RailShell>
        );
    }

    // The rail is a fixed-height sticky column, so the list scrolls inside it
    // rather than growing the page. RailShell owns the height; this element
    // owns the scrolling.
    return (
        <RailShell className={CARD_MB} radius={25} bordered header={cardHeader}>
            {/* relative is the scrollbar's positioning context; it's absolute
                against this, not against the scroller (whose own box scrolls). */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <RailScrollbar getScroller={() => scrollRef.current} />
            <div ref={scrollRef} className={cn("hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto", CARD_PX)}>
                {videos.map((v) => (
                    <RailRow
                        key={v.id}
                        thumbnailUrl={v.thumbnailUrl}
                        isLive={v.isLive}
                        username={v.user.username}
                        verifiedTier={v.user.verifiedTier}
                        title={v.title}
                        views={v.views}
                        menu={<HomeRailRowMenu postId={v.id} userId={v.user.id} />}
                        isActive={v.id === active?.id}
                        hoverColor={stableHoverColor(v.id)}
                        onSelect={() => setActiveId(v.id)}
                    />
                ))}

                {/* Liked is the only tab that can legitimately come back empty — the
                    unfiltered feed is empty only while the first page is in flight,
                    which the skeleton above already covers. */}
                {onLiked && videos.length === 0 && !isLoadingMore && (
                    <p className="px-1 py-6 text-sm text-zinc-500">nothing liked yet</p>
                )}

                {isLoadingMore &&
                    Array.from({ length: LOADING_MORE_ROWS }).map((_, i) => (
                        <RailRowSkeleton key={`more-${i}`} index={i} count={LOADING_MORE_ROWS} />
                    ))}

                {/* Zero-height tripwire below the last row. Kept mounted only while
                    there's more to fetch, so reaching the cap simply ends the scroll. */}
                {hasMore && <div ref={sentinelRef} aria-hidden className="h-px shrink-0" />}
            </div>

            {/* Bottom fade — rows dissolve into the canvas at the card's lower
                edge instead of being cut off mid-row by the border.

                A DELIBERATE EXCEPTION to the app's no-gradients rule, asked for
                directly. It's a mask rather than decoration: the colour is the
                canvas the card sits on, so it reads as the content receding, not
                as a painted band.

                After the scroller in DOM and absolutely positioned, so it paints
                over the rows (the scroller isn't positioned). RailScrollbar
                keeps its z-10 and stays above this, which is what stops the
                thumb fading out at the bottom of its own travel. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-canvas to-transparent"
            />
            </div>
        </RailShell>
    );
}
