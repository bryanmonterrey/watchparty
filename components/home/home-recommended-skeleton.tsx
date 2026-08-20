// Skeleton for home's Recommended tab: one section's worth of chrome — the
// title line, then the 2×3 card grid, each card a thumbnail fill plus the
// avatar/title/username meta row (flat fills, no sweep). Deliberately
// dependency-free: it's both the panel's dynamic-import fallback and the
// query-loading state, so it must not pull the card module into the panel
// chunk — that would undo the lazy split.
//
// Standalone divs with .shimmer-skeleton rather than TrendingVideoCardSkeleton
// for that same reason; keep the shapes in step with the real card by hand.
export function HomeRecommendedSkeleton() {
    return (
        <div className="flex flex-col">
            {/* Title line — a pill standing in for the section heading, at the
                real header's height (text-xl line box + pb-3). */}
            <div className="flex h-10 items-start">
                <div className="h-6 w-28 rounded-full shimmer-skeleton" />
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-7">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3">
                        <div className="aspect-[382/243] w-full rounded-2xl shimmer-skeleton" />
                        <div className="flex items-start gap-3">
                            <div className="size-11 shrink-0 rounded-full shimmer-skeleton" />
                            <div className="min-w-0 flex-1 space-y-2 py-1">
                                <div className="h-4 w-full rounded-full shimmer-skeleton" />
                                <div className="h-4 w-[82%] rounded-full shimmer-skeleton" />
                                <div className="h-3.5 w-1/2 rounded-full shimmer-skeleton" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
