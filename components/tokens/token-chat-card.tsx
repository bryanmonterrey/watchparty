"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Token } from "@/db/schema/content"
import { CoinImage } from "@/components/coins/coin-image";

// Token chat lives with the creator — their channel chat is where holders
// talk. The card is one tap into that room.
export function TokenChatCard({ token, creatorUsername }: { token: Token; creatorUsername: string | null }) {
    const router = useRouter()
    if (!creatorUsername) return null

    const go = () => router.push(`/${creatorUsername}`)

    return (
        <div
            onClick={go}
            className="bg-panel rounded-[25px] p-5 flex items-center justify-between group cursor-pointer transition-all hover:bg-white/5"
        >
            <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                    <CoinImage src={token.imageUrl} alt={token.name} className="size-full" />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-bold text-zinc-200">{token.ticker} chat</span>
                    <span className="text-base text-zinc-500">Live in the creator&apos;s channel</span>
                </div>
            </div>
            <Button
                variant="secondary"
                size="sm"
                onClick={(e) => { e.stopPropagation(); go() }}
                className="bg-zinc-800 text-zinc-300 border-0 h-10 rounded-full font-semibold text-base group-hover:bg-zinc-700 transition-colors"
            >
                Join chat
            </Button>
        </div>
    )
}
