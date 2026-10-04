"use client";

// The coin page's buy/sell card — every coin, every chain the app trades.
//
// It is the board's buy dialog, in a card: the same <BuyPanel> the trending
// rows open, so the amount card, the dollar presets, the wallet switcher, the
// pay-with picker, the details block and the hold-to-confirm are one
// implementation rather than two that looked alike from a distance. What this
// file adds is what a card needs and a dialog doesn't: a buy/sell toggle (a
// dialog opened from a "Buy" button is buy-only; a page about a coin you may
// hold is not), and the two gates that decide whether the panel renders at
// all — a chain with no route, and no session.
//
// Two engines behind one face, both owned by the panel:
//
//   Solana  → the Jupiter path (wallet.getQuote → getSwapTransaction →
//             adapter/Swig signing), so ANY mint trades, not just coins in
//             Jupiter's token list.
//   EVM     → LI.FI through wallet.getEvmSwapQuote / wallet.swapEvm; the
//             server re-quotes and signs from the seed-derived key, the same
//             trust model as sendOnChain.
//
// Chains with no route (sui, bitcoin, anything unknown) keep the open-market
// card instead of a button that fails.

import * as React from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { Button } from "@/components/ui/button";
import { BuyPanel, type TradeSide } from "@/components/trending/buy-panel";
import { cn } from "@/lib/utils";
import { buyableChainId, chainLabel } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import type { CoinViewData } from "./coin-detail";
import type { FirstBuyTarget } from "@/hooks/use-first-buy";

export function CoinTradePanel({
    coin,
    marketUrl,
    cardClassName,
    firstBuy,
}: {
    coin: CoinViewData;
    marketUrl: string | null;
    cardClassName: string;
    /** Set for a DRAFT: the same panel, but the buy launches the coin and
     *  there is no sell side yet. See BuyPanel's prop of the same name. */
    firstBuy?: FirstBuyTarget;
}) {
    // The same slug → chain mapping the dialog uses, so "buyable on the board"
    // and "tradeable on the coin page" can never disagree about a chain.
    const chainId = buyableChainId(coin.network);
    const chain = chainId ? getChain(chainId) : null;
    const tradeable = chainId === "solana" || chain?.kind === "evm";

    const { data: session } = useAuthSession();
    const [side, setSide] = React.useState<TradeSide>("buy");
    const coinSymbol = coin.symbol.replace(/^\$/, "");

    if (!tradeable) {
        return (
            <div className={cn(cardClassName, "p-5")}>
                <h3 className="text-lg font-bold text-white">Trade {coinSymbol}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    In-app swaps aren&apos;t available on {chainLabel(coin.network)} yet.
                </p>
                {marketUrl && (
                    <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85">
                        <a href={marketUrl} target="_blank" rel="noopener noreferrer">Open market</a>
                    </Button>
                )}
            </div>
        );
    }

    if (!session?.user) {
        return (
            <div className={cn(cardClassName, "p-5")}>
                <h3 className="text-lg font-bold text-white">Trade {coinSymbol}</h3>
                <p className="mt-2 text-sm text-zinc-500">Connect or unlock your wallet to trade this coin.</p>
                <Button
                    onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
                    className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"
                >
                    Open wallet
                </Button>
            </div>
        );
    }

    return (
        <div className={cn(cardClassName, "flex flex-col gap-3 p-4")}>
            {/* buy / sell — matches the perps order-panel direction tabs: a
                segmented pill with a subtle white wash on the active side +
                its accent color (green buy / red sell), no solid fill. */}
            <div className={cn("grid gap-1 rounded-full bg-white/[0.04] p-1", firstBuy ? "grid-cols-1" : "grid-cols-2")}>
                {(firstBuy ? (["buy"] as const) : (["buy", "sell"] as const)).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        className={cn(
                            "flex h-11 cursor-pointer items-center justify-center rounded-full text-base font-extrabold capitalize transition-colors",
                            side === s
                                ? cn("bg-white/[0.08]", s === "buy" ? "text-long" : "text-short")
                                : "text-zinc-500 hover:text-white",
                        )}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Keyed on the side so switching starts clean — the presets mean
                different things on each (dollars vs. a share of the position)
                and a selection carried across would be a number in the wrong
                unit. The coin itself is keyed one level up, in CoinSwap. */}
            <BuyPanel key={side} coin={coin} side={side} firstBuy={firstBuy} />
        </div>
    );
}
