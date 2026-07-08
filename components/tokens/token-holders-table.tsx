import React from "react"
import { Token } from "@/db/schema/content"

interface TokenHoldersTableProps {
    token?: Token
}

export function TokenHoldersTable({ token }: TokenHoldersTableProps) {
    const holderCount = token?.holderCount ?? 0

    return (
        <div className="bg-panel rounded-[25px] flex flex-col overflow-hidden w-full">
            {/* Table Header / Actions */}
            <div className="p-5 border-b border-zinc-800/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="text-lg font-extrabold text-white">Holders</span>
                    <span className="bg-zinc-800 text-zinc-400 font-bold text-xs px-2.5 py-0.5 rounded-full border border-zinc-700/20">
                        {holderCount}
                    </span>
                </div>
            </div>

            {/* Holder breakdown needs an indexer (Helius DAS / Birdeye) — not wired yet. */}
            <div className="p-12 text-center text-zinc-600 text-sm font-medium">
                Holder breakdown coming soon
            </div>
        </div>
    )
}
