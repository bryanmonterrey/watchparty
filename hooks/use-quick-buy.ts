"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";

const SOL_WSOL = "So11111111111111111111111111111111111111112";
const AMOUNT_KEY = "trade:quickBuySol";
export const QUICK_BUY_PRESETS = [0.05, 0.1, 0.5, 1] as const;

type QuickBuyToken = {
    id: string;
    tokenAddress?: string | null;
    symbol: string;
    imageUrl?: string | null;
};

/**
 * One-click buy for board rows: preset SOL amount → Jupiter quote → the shared
 * swap engine (adapter or Swig signing, trade-verify settlement, progress
 * toast). Returns "no-wallet" (drawer opened) or "no-mint" (caller should
 * navigate) when it can't execute.
 */
export function useQuickBuy() {
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();
    const { data: session } = useAuthSession();

    const [amountSol, setAmountSolState] = useState(() => {
        if (typeof window === "undefined") return 0.1;
        const saved = Number(localStorage.getItem(AMOUNT_KEY));
        return QUICK_BUY_PRESETS.includes(saved as (typeof QUICK_BUY_PRESETS)[number]) ? saved : 0.1;
    });
    const [buyingId, setBuyingId] = useState<string | null>(null);

    const getQuoteMutation = trpc.wallet.getQuote.useMutation();
    const getSwapTxMutation = trpc.wallet.getSwapTransaction.useMutation();
    const reportSwapSignature = trpc.wallet.reportSwapSignature.useMutation();
    const syncToken = trpc.trade.syncToken.useMutation();
    const utils = trpc.useUtils();

    const setAmountSol = useCallback((v: number) => {
        setAmountSolState(v);
        localStorage.setItem(AMOUNT_KEY, String(v));
    }, []);

    const walletAddress = adapterPublicKey?.toBase58() || session?.user?.wallet_address || null;

    const quickBuy = useCallback(async (token: QuickBuyToken): Promise<"done" | "no-wallet" | "no-mint" | "failed"> => {
        if (!token.tokenAddress) return "no-mint";
        if (!walletAddress) {
            window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT));
            return "no-wallet";
        }
        if (buyingId) return "failed";

        setBuyingId(token.id);
        const symbol = token.symbol.replace(/^\$/, "");
        const swapToast = showSwapToast({
            inputSymbol: "SOL",
            outputSymbol: symbol,
            inputAmount: String(amountSol),
            outputAmount: "",
            outputIcon: token.imageUrl ?? undefined,
        });

        try {
            const quote = await getQuoteMutation.mutateAsync({
                inputMint: SOL_WSOL,
                outputMint: token.tokenAddress,
                amount: Math.floor(amountSol * 1e9),
                slippageBps: 200, // 2% — board buys prioritize landing
            });

            const { swapTransaction, tradeId } = await getSwapTxMutation.mutateAsync({
                quoteResponse: quote,
                userPublicKey: walletAddress,
                wrapAndUnwrapSol: true,
            });

            const { VersionedTransaction } = await import("@solana/web3.js");
            const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));

            swapToast.setStep("signing");
            let signature: string;
            if (adapterPublicKey) {
                signature = await sendTransaction(transaction, connection);
            } else {
                const result = await signAndSubmit({ transaction: swapTransaction });
                signature = result.signature;
            }
            if (tradeId) reportSwapSignature.mutate({ tradeId, signature });

            swapToast.setStep("confirming");
            await connection.confirmTransaction(signature, "confirmed");
            swapToast.success(signature);

            // Event-driven freshness: pull this token's market data right now
            // instead of waiting for the next sync tick, then refresh the feed.
            syncToken.mutate({ mint: token.tokenAddress }, {
                onSettled: () => utils.trade.getFeed.invalidate(),
            });
            return "done";
        } catch (error) {
            const msg = (error as Error)?.message || "Something went wrong. Please try again.";
            swapToast.error(msg.includes("address table") ? "Route unavailable — try the token page." : msg);
            return "failed";
        } finally {
            setBuyingId(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletAddress, buyingId, amountSol, adapterPublicKey, connection]);

    return { quickBuy, buyingId, amountSol, setAmountSol };
}
