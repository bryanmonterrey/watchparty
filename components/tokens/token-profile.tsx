"use client"

import React from "react"
import { Token } from "@/db/schema/content"
import { TokenHeader } from "./token-header"
import { TokenMarketOverview } from "./token-market-overview"
import { TokenStatsGrid } from "./token-stats-grid"
import { TokenDescription } from "./token-description"
import { TokenTradesTable } from "./token-trades-table"
import { TokenSwapCard } from "./token-swap-card"
import { TokenBondingCurve } from "./token-bonding-curve"
import { TokenChatCard } from "./token-chat-card"
import { TokenNotifiedBanner } from "./token-notified-banner"
import { TokenHoldersTable } from "./token-holders-table"

interface TokenProfileProps {
    token: Token & {
        creator: {
            id: string
            name: string
            username: string | null
            avatar_url: string | null
        }
    }
}

export function TokenProfile({ token }: TokenProfileProps) {
    return (
        <div className="w-full max-w-[1400px] mx-auto p-2 pt-16 md:pt-16 lg:pt-16 flex flex-col gap-6 text-zinc-100 min-h-screen">
            

            <div className="grid grid-cols-1 lg:grid-cols-12 items-start">
                
                {/* Left Column */}
                <div className="lg:col-span-8 flex flex-col gap-6 pr-2 ">
                    <div className=" rounded-b-2xl  flex flex-col gap-2">
                        <TokenHeader token={token} />               
                        <TokenMarketOverview />
                    </div>
                    <TokenStatsGrid />
                    <TokenDescription token={token} />
                    <TokenTradesTable token={token} />
                </div>

                {/* Right Column */}
                <div className="lg:col-span-4 pl-2 flex flex-col gap-4">
                    <TokenSwapCard />
                    <TokenBondingCurve />
                    <TokenChatCard token={token} />
                    <TokenNotifiedBanner />
                    <TokenHoldersTable />
                </div>
            </div>
        </div>
    )
}
