"use client";

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast";

/**
 * Buy a coin on any EVM chain with that chain's native coin.
 *
 * Thin on purpose — `wallet.swapEvm` already owns the hard parts: it resolves
 * the user's derived address, converts the human amount using the token's real
 * decimals, quotes LI.FI, handles the ERC-20 allowance, rate-limits, writes the
 * audit log and invalidates the balance cache. Notably it RE-QUOTES server-side
 * rather than executing a quote the client handed it, so there is no window
 * where the price shown and the price filled can diverge by more than the
 * slippage bound.
 *
 * That is also why this signs with the EMBEDDED wallet rather than an injected
 * one: the whole swap path is built around the seed-derived key, and a second
 * signing model would need its own approval handling and its own audit trail.
 * Users without a wallet on the chain get a real message from the server
 * ("open your wallet to set one up") instead of a dead button.
 */

/** Presets in each chain's own native coin. A single shared list would mean
 *  wildly different money per chain — 0.05 is ~$95 of ETH and ~$0.02 of POL. */
const PRESETS_BY_SYMBOL: Record<string, readonly number[]> = {
    ETH: [0.001, 0.005, 0.01, 0.05],
    BNB: [0.005, 0.02, 0.05, 0.2],
    POL: [5, 20, 50, 200],
    HYPE: [0.2, 1, 2, 10],
};

const FALLBACK_PRESETS = [0.01, 0.05, 0.1, 0.5] as const;

export const presetsForSymbol = (symbol: string): readonly number[] =>
    PRESETS_BY_SYMBOL[symbol] ?? FALLBACK_PRESETS;

type EvmBuyToken = {
    id: string;
    symbol: string;
    tokenAddress: string;
};

export function useEvmQuickBuy() {
    const swap = trpc.wallet.swapEvm.useMutation();
    const [buyingId, setBuyingId] = useState<string | null>(null);

    const evmBuy = useCallback(
        async (
            token: EvmBuyToken,
            chain: string,
            amountHuman: string,
            nativeSymbol: string,
            slippageBps: number,
        ): Promise<"done" | "failed"> => {
            if (buyingId) return "failed";
            setBuyingId(token.id);

            const symbol = token.symbol.replace(/^\$/, "");
            const swapToast = showSwapToast({
                inputSymbol: nativeSymbol,
                outputSymbol: symbol,
                inputAmount: amountHuman,
                outputAmount: "",
            });

            try {
                swapToast.setStep("signing");
                const result = await swap.mutateAsync({
                    chain,
                    fromToken: NATIVE_TOKEN,
                    toToken: token.tokenAddress,
                    amountHuman,
                    slippageBps,
                });
                swapToast.success(result.txId, result.explorerUrl);
                return "done";
            } catch (error) {
                swapToast.error((error as Error)?.message || "Something went wrong. Please try again.");
                return "failed";
            } finally {
                setBuyingId(null);
            }
        },
        [swap, buyingId],
    );

    return { evmBuy, buyingId };
}
