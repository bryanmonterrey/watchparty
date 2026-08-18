"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Token } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { TokenHeader } from "./TokenHeader";
import { TokenChart } from "./TokenChart";
import { TokenActions } from "./TokenActions";
import { TokenPosition } from "./TokenPosition";
import { TokenInfo } from "./TokenInfo";
import { TokenAbout } from "./TokenAbout";
import { TokenPerformance } from "./TokenPerformance";
import { TokenActivity } from "./TokenActivity";
import { isVerifiedToken } from "@/lib/tokens/verified";
import { VerifiedTokenBadge } from "@/components/tokens/verified-token-badge";
import { DrawerBackButton } from "../../components/drawer-chrome";

interface TokenDetailViewProps {
    token: Token;
    tokens?: Token[];
    onBack: () => void;
    onSend: () => void;
    onReceive: () => void;
    onSwap: () => void;
    onBuy: () => void;
    onSeeActivity?: () => void;
    hideBalances?: boolean;
}

export function TokenDetailView({ token, tokens, onBack, onSend, onReceive, onSwap, onBuy, onSeeActivity, hideBalances }: TokenDetailViewProps) {
    const [hoveredPrice, setHoveredPrice] = React.useState<number | null>(null);
    const [periodStartPrice, setPeriodStartPrice] = React.useState<number | null>(null);

    const { data: tokenInfo } = trpc.wallet.getTokenInfo.useQuery(
        { mint: token.mint },
        { staleTime: 60 * 60 * 1000 }
    );

    const { data: priceData } = trpc.wallet.getPrices.useQuery(
        { ids: [token.mint] },
        { staleTime: 60000 }
    );
    const dexPrice = priceData?.data[token.mint];

    const enrichedToken: Token = {
        ...token,
        description: token.description ?? tokenInfo?.description,
        links: (token.links && token.links.length > 0) ? token.links : (tokenInfo?.links?.length ? tokenInfo.links : undefined),
        marketCap: token.marketCap || tokenInfo?.marketCap || dexPrice?.marketCap,
        fdv: token.fdv || tokenInfo?.fdv || dexPrice?.fdv,
    };

    return (
        // bg-canvas, the drawer's own surface — this screen used to paint its
        // own bg-black inside a rounded-2xl, so opening a coin visibly stacked a
        // second, darker sheet on top of the drawer.
        <div className="flex h-full flex-col overflow-hidden bg-canvas">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar pb-10">
                {/* Sticky header — content scrolls underneath the blur. Same
                    56px height and 15px bold title as every other sub-screen. */}
                <div className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-canvas/80 px-3 backdrop-blur-md">
                    <div className="flex w-9 shrink-0 items-center">
                        <DrawerBackButton onBack={onBack} />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                        <span className="truncate text-15 font-bold tracking-tight text-white">{token.name}</span>
                        {/* Same mark the list row carries, one click deeper. */}
                        {isVerifiedToken({ mint: token.mint, chain: token.chain }) && (
                            <VerifiedTokenBadge className="size-4" />
                        )}
                    </div>
                    <div className="w-9 shrink-0" />
                </div>

                <TokenHeader token={enrichedToken} hoveredValue={hoveredPrice} periodStartValue={periodStartPrice} />
                <TokenChart token={enrichedToken} onHoverPrice={setHoveredPrice} onPeriodStart={setPeriodStartPrice} />

                {/* Section headings are 12px semibold zinc-500 — the same label
                    the settings screens use — not 18px white, which competed
                    with the values underneath them. */}
                <div className="mt-4 space-y-5 px-5">
                    <TokenActions mint={enrichedToken.mint} onSend={onSend} onReceive={onReceive} onSwap={onSwap} onBuy={onBuy} />
                    <TokenPosition token={enrichedToken} hideBalances={hideBalances} />

                    <section className="space-y-1">
                        <p className="px-1.5 pb-0.5 text-12 font-semibold text-zinc-500">Info</p>
                        <TokenInfo token={enrichedToken} />
                    </section>

                    {(enrichedToken.description || (enrichedToken.links && enrichedToken.links.length > 0)) && (
                        <section className="space-y-2">
                            <p className="px-1.5 text-12 font-semibold text-zinc-500">About</p>
                            <TokenAbout token={enrichedToken} />
                        </section>
                    )}

                    <section className="space-y-1">
                        <p className="px-1.5 pb-0.5 text-12 font-semibold text-zinc-500">24h performance</p>
                        <TokenPerformance token={enrichedToken} />
                    </section>

                    <section className="space-y-1">
                        <div className="flex items-center justify-between px-1.5 pb-0.5">
                            <p className="text-12 font-semibold text-zinc-500">Activity</p>
                            <button
                                onClick={onSeeActivity}
                                className="cursor-pointer text-12 font-semibold text-zinc-500 transition-colors hover:text-white"
                            >
                                See all
                            </button>
                        </div>
                        <TokenActivity token={enrichedToken} tokens={tokens} hideBalances={hideBalances} />
                    </section>
                </div>
            </div>
        </div>
    );
}
