import { PlayerLoadingScreen } from "@/components/video/player-loading";

// The instant shell for /home — the first thing a navigation paints.
//
// It exists because /home's client chunks (the (rails) group mounts AlertsRail,
// the deliberately-heavy import) take real time to arrive, and until they do a
// navigation would otherwise hold the OLD page. Served in the RSC payload, this
// needs no client chunk at all — see the history in the 8/20 nav-freeze work.
//
// EVERY box here mirrors what the mounted page paints WHILE ITS QUERIES LOAD,
// not a generic skeleton — otherwise the navigation shows two different
// loading states in a row (owner: "looks like /home has more than 1 loading
// state"). The mounted loading frame is:
//   · hero — HomeHero renders PlayerLoadingOverlay: BLACK with the ytp
//     spinner, never a grey shimmer (player-loading.tsx's own rule: a black
//     frame promises a video, a grey block promises a layout). Reused here
//     directly — the file is server-safe.
//   · tabs — HomeCategoryTabs renders its real text labels immediately
//     (they're data-independent), so this paints the same two labels with the
//     same classes, just not clickable yet.
//   · board — TrendingTable renders real header labels over 12 rows of
//     64px skeleton rows (avatar + name bars, right-aligned value bars).
// When the page lands, each layer swaps in place and nothing visibly changes
// until data arrives.
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
                        {/* Hero: the same black 16:9 + spinner the mounted
                            HomeHero shows while the feed query loads. */}
                        <PlayerLoadingScreen />
                        {/* Category tabs: HomeCategoryTabs' real labels and
                            classes (px-3.5 py-1.5 text-lg font-semibold, active
                            white / rest zinc-500), in the panel's h-12 pb-2
                            strip. Real text, not pills — the mounted bar shows
                            text immediately. */}
                        <div className="flex h-12 items-center gap-2 pb-2 pt-3">
                            <span className="shrink-0 whitespace-nowrap px-3.5 py-1.5 text-lg font-semibold tracking-tight text-flexwhite">Trending Coins</span>
                            <span className="shrink-0 whitespace-nowrap px-3.5 py-1.5 text-lg font-semibold tracking-tight text-zinc-500">Recommended</span>
                        </div>
                        {/* Board header: the DataTable renders its real labels
                            while loading (CELL_TEXT = text-15 font-medium,
                            zinc-500). At this column width the visible set is
                            Name / Price / Change (volume+mcap need wider). */}
                        <div className="flex items-center gap-3 py-2 text-15 font-medium leading-tight text-zinc-500">
                            <span className="flex-1">Name</span>
                            <span className="w-16 text-right">Price</span>
                            <span className="w-14 text-right">Change</span>
                            <span className="w-8" />
                        </div>
                        {/* 12 rows at the table's 64px rowHeight — the same
                            anatomy its own skeleton draws: size-9 coin avatar,
                            two name bars, then the per-column value bars. */}
                        {Array.from({ length: 12 }).map((_, index) => (
                            <div key={index} className="flex h-16 items-center gap-3">
                                <div className="size-9 shrink-0 rounded-full shimmer-skeleton" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3.5 w-1/4 rounded-full shimmer-skeleton" />
                                    <div className="h-3 w-1/6 rounded-full shimmer-skeleton" />
                                </div>
                                <div className="flex w-16 justify-end"><div className="h-3 w-16 rounded-full shimmer-skeleton" /></div>
                                <div className="flex w-14 justify-end"><div className="h-3 w-12 rounded-full shimmer-skeleton" /></div>
                                <div className="flex w-8 justify-end"><div className="h-3 w-8 rounded-full shimmer-skeleton" /></div>
                            </div>
                        ))}
                    </div>
                </main>
                <div className="ml-7 mr-auto hidden w-96 shrink-0 xl:block" aria-hidden />
        </div>
    );
}
