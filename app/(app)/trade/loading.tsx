// The instant shell for /trade — mirrors the discover board's own first
// frame (see home/loading.tsx for the standard: every box is what the
// mounted page paints WHILE ITS QUERIES LOAD, never a generic skeleton).
//
//   · tabs — trade-discover renders its real pill labels immediately
//     (data-independent): Trending active on the sidebar-hover pill, the
//     rest zinc-400. Same classes, just not clickable yet.
//   · controls — the timeframe pills and chain select stand in as blanks
//     at their real sizes.
//   · board — column labels over rows of the table's anatomy: coin avatar,
//     ticker/name bars, right-aligned value bars, and the Buy pill blank.
export default function TradeLoading() {
    return (
        <div className="h-full w-full px-6 pt-4" aria-hidden>
            <div className="flex items-center justify-between">
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

            <div className="mt-6 flex items-center gap-3 py-2 text-15 font-medium leading-tight text-zinc-500">
                <span className="flex-1">Coin</span>
                <span className="w-28 text-right">Market cap</span>
                <span className="w-28 text-right">Volume</span>
                <span className="w-28 text-right">Price</span>
                <span className="w-24 text-right">Txns</span>
                <span className="w-28 text-right">Action</span>
            </div>
            {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex h-[76px] items-center gap-3">
                    <div className="flex flex-1 items-center gap-3">
                        <div className="size-11 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-3.5 w-28 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-16 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                    <div className="flex w-28 justify-end"><div className="h-3.5 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-28 justify-end"><div className="h-3.5 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-28 justify-end"><div className="h-3.5 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-24 justify-end"><div className="h-3.5 w-12 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-28 justify-end"><div className="h-10 w-24 rounded-full shimmer-skeleton" /></div>
                </div>
            ))}
        </div>
    );
}
