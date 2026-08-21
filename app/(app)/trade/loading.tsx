// The instant shell for /trade — mirrors the discover board's own first
// frame (see home/loading.tsx for the standard: every box is what the
// mounted page paints WHILE ITS QUERIES LOAD, never a generic skeleton).
//
//   · tabs — trade-discover renders its real pill labels immediately
//     (data-independent): Trending active on the sidebar-hover pill, the
//     rest zinc-400. Same classes, just not clickable yet.
//   · controls — the timeframe pills and chain select stand in as blanks
//     at their real sizes.
//   · board — column labels (Coin / Market cap / Price / Change / Action)
//     over rows of the table's anatomy: coin avatar, ticker/name bars,
//     right-aligned value bars, and the buy group's pill footprint.
export default function TradeLoading() {
    return (
        <div className="h-full w-full" aria-hidden>
            {/* The control bar, mirrored WHOLE — its sticky wrapper, its glass
                fill, its header spacer (hidden below md) and its tab row at
                the real padding. Reproducing only the two inner boxes let the
                tabs ride up over the app header, because the wrapper is what
                holds them under it. */}
            <div className="sticky top-0 z-40">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-canvas backdrop-blur-sm" />
                <div className="h-(--header-height) max-md:hidden" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-2 lg:px-6">
                    <div className="flex items-center gap-1">
                        <span className="flex items-center rounded-full bg-sidebar-hover px-4 py-2 text-lg font-bold tracking-tight text-flexwhite">Trending</span>
                        {["Surge", "Live", "Top", "New"].map((label) => (
                            <span key={label} className="flex items-center rounded-full px-4 py-2 text-lg font-bold tracking-tight text-zinc-400">{label}</span>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-36 rounded-full shimmer-skeleton" />
                        <div className="h-11 w-32 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-2 text-15 font-medium leading-tight text-zinc-500">
                <span className="flex-1">Coin</span>
                <span className="w-32 text-right">Market cap</span>
                <span className="w-28 text-right">Price</span>
                <span className="w-24 text-right">Change</span>
                <span className="w-[232px] text-right">Action</span>
            </div>
            {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex h-[76px] items-center gap-3 px-6">
                    <div className="flex flex-1 items-center gap-3">
                        <div className="size-11 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-3.5 w-28 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-16 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                    <div className="flex w-32 justify-end"><div className="h-3.5 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-28 justify-end"><div className="h-3.5 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-24 justify-end"><div className="h-3.5 w-12 rounded-full shimmer-skeleton" /></div>
                    {/* The buy group's own footprint — one pill, not a stub. */}
                    <div className="flex w-[232px] justify-end"><div className="h-11 w-[185px] rounded-full shimmer-skeleton" /></div>
                </div>
            ))}
        </div>
    );
}
