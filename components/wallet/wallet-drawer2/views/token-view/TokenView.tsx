"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
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
        <div className="flex flex-col h-full bg-black rounded-2xl overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar pb-10">
                {/* Sticky header — content scrolls underneath the blur */}
                <div className="sticky top-0 z-10 backdrop-blur-xs bg-black/80 rounded-t-2xl relative flex items-center justify-center px-5 pt-4 pb-2 min-h-[60px]">
                    <button
                        onClick={onBack}
                        className="absolute left-3 p-2 rounded-full hover:bg-zinc-800/50 transition-colors cursor-pointer text-zinc-400 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-white/90">{token.name}</span>
                        {/* Same mark the list row carries, one click deeper. */}
                        {isVerifiedToken({ mint: token.mint, chain: token.chain }) && (
                            <VerifiedTokenBadge className="size-5" />
                        )}
                    </div>
                </div>

                <TokenHeader token={enrichedToken} hoveredValue={hoveredPrice} periodStartValue={periodStartPrice} />
                <TokenChart token={enrichedToken} onHoverPrice={setHoveredPrice} onPeriodStart={setPeriodStartPrice} />

                <div className="px-5 space-y-6 mt-4">
                    <TokenActions mint={enrichedToken.mint} onSend={onSend} onReceive={onReceive} onSwap={onSwap} onBuy={onBuy} />
                    <TokenPosition token={enrichedToken} hideBalances={hideBalances} />

                    <div className="space-y-6">
                        <section>
                            <h3 className="text-lg font-bold text-white/90 mb-3">Info</h3>
                            <TokenInfo token={enrichedToken} />
                        </section>

                        {(enrichedToken.description || (enrichedToken.links && enrichedToken.links.length > 0)) && (
                            <section>
                                <h3 className="text-lg font-bold text-white/90 mb-3">About</h3>
                                <TokenAbout token={enrichedToken} />
                            </section>
                        )}

                        <section>
                            <h3 className="text-lg font-bold text-white/90 mb-3">24h Performance</h3>
                            <TokenPerformance token={enrichedToken} />
                        </section>

                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-white/90">Activity</h3>
                                <button
                                    onClick={onSeeActivity}
                                    className="text-[13px] font-bold text-bleu hover:text-bleu/80 transition-colors cursor-pointer"
                                >
                                    See More
                                </button>
                            </div>
                            <TokenActivity token={enrichedToken} tokens={tokens} hideBalances={hideBalances} />
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
