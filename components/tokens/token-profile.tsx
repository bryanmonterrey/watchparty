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
import { HomeActionDock } from "@/components/home/home-action-dock"

interface TokenProfileProps {
    token: Token & {
        creator: {
            id: string
            name: string
            username: string | null
            avatar_url: string | null
            /** first-buy launches route fees/identity to this wallet */
            wallet_address?: string | null
        }
    }
}

export function TokenProfile({ token }: TokenProfileProps) {
    const [activeTab, setActiveTab] = useState<"holders" | "trades">("holders")

    const holderCount = token.holderCount ?? 0

    return (
        // The token page's own columns, in home's frame: the alerts rail comes
        // from (rails)/layout.tsx, this supplies the middle (chart, stats,
        // holders/trades), the swap panel as a right rail, and the action dock
        // in the far gutter — four columns, same as home and /feed.
        //
        // A flex ROW at lg, stacked below it. The 10-column grid this replaces
        // couldn't do that job any more: the page no longer owns the full
        // viewport (the rail takes its share), so proportional columns sized off
        // the wrong box. Stacking rather than hiding keeps the swap panel on one
        // mount — rendering it twice for two breakpoints would double its
        // queries.
        //
        // min-w-0 throughout: this subtree holds long unbreakable strings (mints,
        // prices), and without it their max-content width wins and the page
        // shoves the alerts rail off-screen instead of narrowing.
        <div className="flex w-full min-w-0 flex-col text-zinc-100 min-h-screen lg:flex-row">
            <main className="flex min-w-0 flex-1 flex-col gap-3 px-3 pt-header">
                <div className="flex min-w-0 flex-col gap-3">
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
            </main>

            {/* Right rail: the swap panel and what hangs off it. At lg+ it pins
                and scrolls inside itself, the same way home's rails do — the
                trade panel is the thing you keep reaching for while reading the
                chart and trades, so it shouldn't scroll away with them.

                Below lg the row stacks, and this becomes a full-width block
                under the main content — sticky and the fixed height are scoped
                to lg for that reason. */}
            <aside className="w-full shrink-0 px-3 pb-6 lg:w-96 lg:px-0 lg:pb-0 lg:pr-3">
                <div className="hidden-scrollbar flex flex-col gap-3 lg:sticky lg:top-0 lg:h-[100svh] lg:overflow-y-auto lg:pb-2 lg:pt-[calc(var(--header-height)+2px)]">
                    <TokenSwapCard
                        token={token}
                        creatorWallet={token.creator.wallet_address ?? null}
                        creatorAvatar={token.creator.avatar_url}
                    />
                    <TokenBondingCurve token={token} />
                    <TokenChatCard token={token} creatorUsername={token.creator.username} />
                    <TokenNotifiedBanner tokenId={token.id} />
                </div>
            </aside>

            {/* Home's 4th column — same dock, same order, same collapse state. */}
            <HomeActionDock />
        </div>
    )
}
