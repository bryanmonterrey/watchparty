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
// rule): the max-w-[628px] centre with ml-7 and the h-13 toolbar spacer, the
// w-96 right rail (xl+). The left rail belongs to the (rails) LAYOUT, which
// wraps this fallback and draws it itself.
// Rows copy FeedSurfaceLoading so the route-level and component-level states
// are indistinguishable — the swap between them must not be visible.
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
                    <div className="h-13" />
                    <div className="flex flex-col" aria-hidden>
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="border-b border-soft-gray/10 p-4">
                                <div className="flex gap-3">
                                    <div className="size-11 rounded-full shimmer-skeleton" />
                                    <div className="flex-1 space-y-3">
                                        <div className="h-3.5 w-2/5 rounded-full shimmer-skeleton" />
                                        <div className="h-3.5 w-4/5 rounded-full shimmer-skeleton" />
                                        {index % 2 === 1 && (
                                            <div className="aspect-video w-full rounded-xl shimmer-skeleton" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
                <div className="ml-7 mr-auto hidden w-96 shrink-0 xl:block" aria-hidden />
        </div>
    );
}
