// The feed column's loading anatomy — the sticky tab bar's box and six post
// rows. One definition, used from BOTH places a feed skeleton paints:
//
// - app/(app)/(rails)/feed/loading.tsx, where it is the navigation's instant
//   shell (served in the RSC payload, so it needs no client chunk — which is
//   why this file must stay a server-safe component: no "use client", no
//   hooks, or the loading boundary would wait on the very chunk it exists to
//   paint before);
// - the lazy BrowseFeed imports (home's feed overlay and /feed's page), as the
//   dynamic() loading fallback while the 800-line feed chunk parses.
//
// Geometry mirrors BrowseFeed's own anatomy (header-skeletons-mirror-tiles):
// h-13 for the tab bar, then avatar + text pills per post, every other row
// carrying a media block.
export function FeedSurfaceLoading() {
    return (
        <div className="flex flex-col">
            <div className="sticky top-[var(--header-height)] h-13 bg-canvas" />
            {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="border-b border-soft-gray/10 p-4">
                    <div className="flex gap-3">
                        <div className="size-11 rounded-full shimmer-skeleton" />
                        <div className="flex-1 space-y-3">
                            <div className="h-3.5 w-2/5 rounded-full shimmer-skeleton" />
                            <div className="h-3.5 w-4/5 rounded-full shimmer-skeleton" />
                            {index % 2 === 1 && <div className="aspect-video w-full rounded-xl shimmer-skeleton" />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
