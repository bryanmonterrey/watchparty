import React from "react"
import { Token } from "@/db/schema/content"

// Live bonding-curve progress from the stream-worker cache. Flat fills only:
// lantern while bonding, sunset when close (≥80%), full lantern once migrated.
export function TokenBondingCurve({ token }: { token: Token }) {
    const migrated = token.phase === "migrated"
    const progress = migrated ? 100 : Math.min(100, Math.max(0, token.bondingProgress ?? 0))
    const color = migrated ? "#00ED89" : progress >= 80 ? "#FFCC00" : "#00ED89"

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
            <p className="text-md text-zinc-500 mt-1">
                {migrated
                    ? "Graduated — trading on the open market"
                    : progress >= 80
                        ? "Almost there — migration is close"
                        : "Fills as people buy on the curve; at 100% the token graduates"}
            </p>
        </div>
    )
}
