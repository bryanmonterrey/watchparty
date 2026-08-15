import React from "react"
import { Token } from "@/db/schema/content"
import { cn } from "@/lib/utils"

// Live bonding-curve progress from the stream-worker cache. Flat fills only:
// lantern while bonding, sunset when close (≥80%), full lantern once migrated.
//
// `compact` is the coin page's 324px swap column — the swap-card outline instead
// of the panel fill, and the column's 13/15px type. A variant rather than a
// restyle because TokenProfile still renders the roomy version at `?legacy=1`.
export function TokenBondingCurve({
    token,
    compact = false,
    cardClassName,
}: {
    token: Token
    compact?: boolean
    cardClassName?: string
}) {
    const migrated = token.phase === "migrated"
    const progress = migrated ? 100 : Math.min(100, Math.max(0, token.bondingProgress ?? 0))
    const color = migrated ? "#00ED89" : progress >= 80 ? "#FFCC00" : "#00ED89"

    const caption = migrated
        ? "Graduated — trading on the open market"
        : progress >= 80
            ? "Almost there — migration is close"
            : "Fills as people buy on the curve; at 100% the coin graduates"

    if (compact) {
        return (
            <div className={cn(cardClassName, "mt-2 flex flex-col gap-2 p-4")}>
                <div className="flex items-center justify-between">
                    <h3 className="text-15 font-semibold text-flexwhite">Bonding curve</h3>
                    <span className="text-13 font-semibold tabular-nums text-zinc-200">
                        {progress.toFixed(1)}%
                    </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                        className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none"
                        style={{ width: `${progress}%`, backgroundColor: color }}
                    />
                </div>
                <p className="text-xs text-zinc-600">{caption}</p>
            </div>
        )
    }

    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between text-lg font-bold">
                <span className="text-zinc-200">Bonding curve progress</span>
                <span className="tabular-nums text-zinc-200">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: color }}
                />
            </div>
            <p className="text-md text-zinc-500 mt-1">{caption}</p>
        </div>
    )
}
