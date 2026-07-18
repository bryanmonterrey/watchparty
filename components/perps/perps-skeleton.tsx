"use client";

// One loading surface for the whole perps terminal. Used BOTH as the
// dynamic() loading component (while the Flash SDK chunk downloads) and as
// PerpsView's initial state (while markets load) — the user sees a single
// continuous skeleton instead of a loader-then-skeletons double transition.
// Layout mirrors the real terminal exactly: 320/flex/320 grid, tab strips,
// chart band + book, positions strip, ticket + balance card.

function Bar({ className }: { className: string }) {
    return (
        <div className={`overflow-hidden rounded-full ${className}`}>
            <div className="size-full shimmer-skeleton" />
        </div>
    );
}

function TabStrip({ tabs }: { tabs: number }) {
    return (
        <div className="flex border-b border-white/[0.06] bg-panel1">
            {Array.from({ length: tabs }).map((_, i) => (
                <div
                    key={i}
                    className={`flex flex-1 items-center justify-center py-3 ${i < tabs - 1 ? "border-r border-white/[0.06]" : ""}`}
                >
                    <Bar className="h-3 w-14" />
                </div>
            ))}
        </div>
    );
}

function Rows({ count }: { count: number }) {
    return (
        <div className="space-y-1 p-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-1.5 py-2">
                    <Bar className="h-3.5 w-16" />
                    <Bar className="h-3.5 w-20" />
                </div>
            ))}
        </div>
    );
}

export function PerpsSkeleton({ geoBlocked = false }: { geoBlocked?: boolean }) {
    return (
        <div className="h-full bg-background">
            <div className="mx-auto flex max-w-[1440px] flex-col px-2 pb-4 pt-4 md:pt-(--header-height) lg:h-dvh lg:pb-2">
                {geoBlocked && (
                    <div className="mt-2 flex items-center justify-center gap-2 rounded-md bg-sunset/10 px-4 py-2.5">
                        <p className="text-center text-[13px] font-semibold text-sunset">
                            Access to this product isn&apos;t available in your region. Prices and markets stay visible.
                        </p>
                    </div>
                )}
                <div className="mt-2 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:gap-2">
                    {/* Markets rail */}
                    <div className="hidden overflow-hidden rounded-lg border border-white/10 bg-panel2 lg:block">
                        <TabStrip tabs={2} />
                        <Rows count={12} />
                    </div>

                    {/* Center: chart + book, positions beneath */}
                    <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
                        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-2">
                            <div className="overflow-hidden rounded-lg border border-white/10 bg-panel1 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="size-7 rounded-full bg-white/[0.06]" />
                                    <Bar className="h-5 w-24" />
                                    <div className="ml-auto flex gap-8">
                                        <Bar className="h-4 w-16" />
                                        <Bar className="h-4 w-16" />
                                    </div>
                                </div>
                                <div className="mt-4 h-[280px] overflow-hidden rounded-md sm:h-[420px]">
                                    <div className="size-full shimmer-skeleton" />
                                </div>
                            </div>
                            <div className="hidden overflow-hidden rounded-lg border border-white/10 bg-panel2 lg:block">
                                <TabStrip tabs={2} />
                                <Rows count={11} />
                            </div>
                        </div>
                        <div className="mt-2 hidden overflow-hidden rounded-lg border border-white/10 bg-panel2 lg:block">
                            <TabStrip tabs={4} />
                            <div className="min-h-[240px] p-2">
                                <Rows count={2} />
                            </div>
                        </div>
                    </div>

                    {/* Order ticket + balance */}
                    <div className="mt-3 lg:mt-0 lg:flex lg:min-h-0 lg:flex-col">
                        <div className="rounded-lg bg-panel1 p-4 ring-1 ring-white/10">
                            <div className="h-12 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className="mt-4 h-12 overflow-hidden rounded-2xl"><div className="size-full shimmer-skeleton" /></div>
                            <div className="mt-4 space-y-2 px-1">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <Bar className="h-3 w-20" />
                                        <Bar className="h-3 w-14" />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 h-12 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        </div>
                        <div className="mt-2 rounded-lg bg-panel1 p-4 ring-1 ring-white/10 lg:flex-1">
                            <div className="flex items-center justify-between">
                                <Bar className="h-3 w-24" />
                                <Bar className="h-3 w-14" />
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <Bar className="h-3 w-28" />
                                <Bar className="h-3 w-14" />
                            </div>
                            <div className="mt-4 h-11 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className="mt-2 h-11 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
