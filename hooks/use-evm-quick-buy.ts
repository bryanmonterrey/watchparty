"use client";

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast";

// Re-exported so existing importers keep working; the table itself moved to
// lib/trade/buy-presets, because presets follow the SPENT token and the
// pay-with picker can select one no chain calls native.
export { presetsForSymbol } from "@/lib/trade/buy-presets";

/**
 * Buy a coin on any EVM chain, paying with the native coin OR any ERC-20 the
 * user holds — `executeLifiSwap` handles the allowance when the input is a
 * token, so the only thing the picker has to supply is which contract.
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
            pay: { token: string; symbol: string },
            slippageBps: number,
        ): Promise<"done" | "failed"> => {
            if (buyingId) return "failed";
            setBuyingId(token.id);

            const symbol = token.symbol.replace(/^\$/, "");
            const swapToast = showSwapToast({
                inputSymbol: pay.symbol,
                outputSymbol: symbol,
                inputAmount: amountHuman,
                outputAmount: "",
            });

            try {
                swapToast.setStep("signing");
                const result = await swap.mutateAsync({
                    chain,
                    fromToken: pay.token,
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
