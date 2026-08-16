"use client";

import { useCallback, useState } from "react";
import { useEvm } from "@/lib/chains/evm/evm-provider";
import { hexChainId, type EvmBuyQuote } from "@/lib/chains/evm/swap";
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast";

/** Presets in the chain's own coin. ETH is ~$1.9k, so these run roughly
 *  $2 / $9 / $19 / $94 — the same spread of intent as the SOL presets, not the
 *  same numbers, because a shared preset list would mean wildly different money
 *  on each chain. */
export const EVM_BUY_PRESETS = [0.001, 0.005, 0.01, 0.05] as const;

const EXPLORERS: Record<number, string> = { 8453: "https://basescan.org/tx/" };

type EvmBuyToken = {
    id: string;
    symbol: string;
    tokenAddress: string;
};

/**
 * The EVM counterpart to `useQuickBuy`: takes a quote the dialog already
 * fetched and sends it through the connected wallet.
 *
 * It executes a quote rather than fetching its own, because the dialog has to
 * SHOW the estimate before the user commits — so the quote already exists by
 * the time anyone clicks Buy, and re-fetching here would both waste a round
 * trip and let the user confirm one number while a different one executes.
 *
 * Raw EIP-1193 rather than wagmi: `EvmProvider` is deliberately lean (EIP-6963
 * discovery + `provider.request`), and wagmi is present in the tree only for
 * the login path. Reaching for it here would pull a second connection stack
 * into the board's bundle for one `eth_sendTransaction`.
 */
export function useEvmQuickBuy() {
    const { provider, address, chainId, connected } = useEvm();
    const [buyingId, setBuyingId] = useState<string | null>(null);

    const evmBuy = useCallback(
        async (
            token: EvmBuyToken,
            quote: EvmBuyQuote,
            spendLabel: string,
        ): Promise<"done" | "no-wallet" | "failed"> => {
            if (!provider || !address || !connected) return "no-wallet";
            if (buyingId) return "failed";

            setBuyingId(token.id);
            const symbol = token.symbol.replace(/^\$/, "");
            const swapToast = showSwapToast({
                inputSymbol: "ETH",
                outputSymbol: symbol,
                inputAmount: spendLabel,
                outputAmount: "",
            });

            try {
                // The wallet may be sitting on a different chain than the row.
                // Switching BEFORE signing matters: a transaction built for
                // 8453 and submitted on another chain is not merely rejected,
                // it can be replayed against whatever contract occupies that
                // address elsewhere.
                if (chainId !== quote.chainId) {
                    swapToast.setStep("building");
                    try {
                        await provider.request({
                            method: "wallet_switchEthereumChain",
                            params: [{ chainId: hexChainId(quote.chainId) }],
                        });
                    } catch (switchErr) {
                        // 4902 = the wallet doesn't know this chain yet. Any
                        // other code is a real refusal (usually the user
                        // declining) and must not be papered over.
                        const code = (switchErr as { code?: number })?.code;
                        if (code !== 4902) throw switchErr;
                        await provider.request({
                            method: "wallet_addEthereumChain",
                            params: [
                                {
                                    chainId: hexChainId(quote.chainId),
                                    chainName: "Base",
                                    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                                    rpcUrls: ["https://mainnet.base.org"],
                                    blockExplorerUrls: ["https://basescan.org"],
                                },
                            ],
                        });
                    }
                }

                swapToast.setStep("signing");
                const txHash: string = await provider.request({
                    method: "eth_sendTransaction",
                    params: [
                        {
                            from: address,
                            to: quote.tx.to,
                            data: quote.tx.data,
                            value: quote.tx.value,
                            // `gas`, not `gasLimit` — see EvmSwapTx. Omitted
                            // entirely when absent so the wallet estimates
                            // rather than receiving `undefined`.
                            ...(quote.tx.gas ? { gas: quote.tx.gas } : {}),
                        },
                    ],
                });

                // No receipt poll: the wallet returns once the transaction is
                // broadcast, and the explorer link is what the user follows
                // from here. Waiting would need an RPC this path doesn't have.
                swapToast.success(txHash, (EXPLORERS[quote.chainId] ?? "") + txHash);
                return "done";
            } catch (error) {
                const code = (error as { code?: number })?.code;
                const msg =
                    code === 4001
                        ? "Cancelled."
                        : (error as Error)?.message || "Something went wrong. Please try again.";
                swapToast.error(msg);
                return "failed";
            } finally {
                setBuyingId(null);
            }
        },
        [provider, address, connected, chainId, buyingId],
    );

    return { evmBuy, buyingId, address, connected };
}
