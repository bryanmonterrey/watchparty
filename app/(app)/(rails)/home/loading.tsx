// The instant shell for /home — the first thing a navigation paints.
//
// This file exists because /home had NO loading state at the route level, and
// the one it has at the component level could not fire in the reported case.
// The skeletons live inside FeedSurfaceLoading in home-page-surface.tsx, which
// is CLIENT code — and /home sits under the (rails) group, whose layout mounts
// AlertsRail, the deliberately-heavy import (BidirectionalList + the realtime
// client). Entering the group from anywhere else downloads that whole chunk
// before a single client component can render, so the navigation held the OLD
// page for the entire download and then painted /home fully formed — by which
// point the feed query's cached data made even the component-level skeletons
// skip. Slow navigation, zero skeletons, exactly as reported.
//
// loading.tsx is served as part of the navigation's RSC payload, needing no
// client chunk at all, so it paints immediately while the group's JS loads.
//
// Geometry mirrors what the PAGE renders (the header-skeletons-mirror-tiles
// rule) — and "the page" means /home's FIRST SCREEN: the hero, the category
// tabs, the trending board. The first version copied the browse feed's rows
// here, which was the wrong anatomy — the feed lives below the fold, so the
// navigation painted feed cards where a hero and a board were about to land
// (owner: "browse feed isn't part of the current navigation"). The left rail
// belongs to the (rails) LAYOUT, which wraps this fallback and draws itself.
export default function HomeLoading() {
    // ONLY the page slot. This renders INSIDE the (rails) layout, which
    // already draws the real left rail beside it — a rail spacer here would
    // double-count and shove the centre column 18rem right.
    return (
        <div className="flex min-h-screen w-full">
                {/* The collapsed-rail variant is LOAD-BEARING, not optional
                    mirroring. Arriving from /coin the shared rail is collapsed
                    (w-11), and the real column widens to 872px in response —
                    a skeleton pinned at 628px sat narrow against the collapsed
                    rail, "aligned to the left", then jumped when the page
                    landed. Same group-has hook, same widths, same swap. */}
                <main className="relative ml-7 flex w-full min-w-0 max-w-[628px] flex-col md:mt-[var(--header-height)] group-has-[[data-rail-collapsed=true]]/rails:max-w-[872px]">
                    <div aria-hidden>
                        {/* Hero: aspect-video full-bleed, same box as
                            HomeCenterColumn's HERO_BASE. A media stand-in, so
                            it stays rectangular — pills are for text. */}
                        <div className="aspect-video w-full shimmer-skeleton" />
                        {/* Category tabs: the real bar is h-12 with pb-2. */}
                        <div className="flex h-12 items-center gap-2 pb-2 pt-3">
                            {[64, 96, 80, 72].map((w) => (
                                <div key={w} className="h-8 rounded-full shimmer-skeleton" style={{ width: w }} />
                            ))}
                        </div>
                        {/* Board rows: coin avatar + text pills, the trending
                            table's own row anatomy. */}
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-3 py-3">
                                <div className="size-9 shrink-0 rounded-full shimmer-skeleton" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3.5 w-1/4 rounded-full shimmer-skeleton" />
                                    <div className="h-3 w-1/6 rounded-full shimmer-skeleton" />
                                </div>
                                <div className="h-3.5 w-14 rounded-full shimmer-skeleton" />
                                <div className="h-3.5 w-14 rounded-full shimmer-skeleton" />
                            </div>
                        ))}
                    </div>
                </main>
                <div className="ml-7 mr-auto hidden w-96 shrink-0 xl:block" aria-hidden />
        </div>
    );
}
