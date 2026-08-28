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
        <div className="flex min-h-screen w-full min-w-0">
                {/* THE COLUMN'S CLASSES ARE THE MOUNTED PAGE'S, VERBATIM — copy
                    the <main> in home-page-surface.tsx, do not paraphrase it.
                    The shell and the page are two paints of one column, and
                    every place their widths were allowed to differ has shown
                    up as the skeleton visibly resizing:
                    · the collapsed-rail swap (628 -> 872) has to be here, or
                      arriving from /coin with the rail collapsed the shell sat
                      narrow and jumped when the page landed;
                    · it has to be scoped max-xl:, because at xl the page's
                      column is flex-1 with NO cap — an unscoped group-has
                      rule outranks the plain xl: classes on specificity and
                      would pin the shell at 872 while the page takes the
                      row's slack, so the skeleton grew again on landing. */}
                <main className="relative ml-7 flex w-full min-w-0 max-w-[628px] flex-col md:mt-[var(--header-height)] max-xl:group-has-[[data-rail-collapsed=true]]/rails:max-w-[872px] xl:max-w-none xl:flex-1">
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
                {/* The right-hand columns, at the page's own widths, because
                    at xl the centre is flex-1 and takes whatever they leave:
                    the video rail (ml-7 w-96, no mr-auto — the page's aside
                    has none either) and the action dock, which mounts
                    EXPANDED by default at pl-2 + size-15 + pr-1 = 72px. Leave
                    the dock out and the shell's column is 72px wider than the
                    page's, and shrinks on landing. */}
                <div className="ml-7 hidden w-96 shrink-0 xl:block" aria-hidden />
                <div className="hidden w-18 shrink-0 xl:block" aria-hidden />
        </div>
    );
}
