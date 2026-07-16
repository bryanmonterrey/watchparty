"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
    const [activeTab, setActiveTab] = useState<"holders" | "trades">("holders")

    const holderCount = token.holderCount ?? 0

    return (
        <div className="w-full px-4 mx-auto p-2 pt-header flex flex-col gap-6 text-zinc-100 min-h-screen">
            <div className="grid grid-cols-1 lg:grid-cols-10 items-start gap-3">
                
                {/* Left Column */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                    <TokenHeader token={token} />               
                    <TokenMarketOverview token={token} />
                    <TokenStatsGrid token={token} />
                    <TokenDescription token={token} />

                    {/* Apple-style Segment Control Tabs */}
                    <div className="flex flex-col gap-4 mt-2">
                        <div className="relative inline-flex rounded-full bg-[#16181c] p-1 text-sm font-semibold shadow-inner self-start">
                            {(["holders", "trades"] as const).map((tab) => {
                                const active = activeTab === tab;
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`relative z-10 px-5 py-3 rounded-full capitalize text-xs sm:text-sm font-bold transition-colors duration-200 select-none cursor-pointer focus:outline-none min-w-[90px] sm:min-w-[110px] ${
                                            active ? "text-black" : "text-zinc-400 hover:text-white"
                                        }`}
                                    >
                                        {tab === "holders" ? `Holders (${holderCount})` : "Trades"}
                                        {active && (
                                            <motion.div
                                                layoutId="profile-toggle-bg"
                                                className="absolute inset-0 bg-white rounded-full -z-10"
                                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Animated Tab Content Transition */}
                        <div className="w-full">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.15, ease: "easeInOut" }}
                                >
                                    {activeTab === "holders" ? (
                                        <TokenHoldersTable token={token} />
                                    ) : (
                                        <TokenTradesTable token={token} />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 flex flex-col gap-3">
                    <TokenSwapCard token={token} />
                    <TokenBondingCurve token={token} />
                    <TokenChatCard token={token} creatorUsername={token.creator.username} />
                    <TokenNotifiedBanner />
                </div>
            </div>
        </div>
    )
}
