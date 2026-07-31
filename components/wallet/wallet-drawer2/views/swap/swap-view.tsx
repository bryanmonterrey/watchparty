"use client";

import * as React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { toPublicKey } from "@/lib/solana/pubkey";
import { ArrowDown, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { Button } from "@/components/ui/button";
import { Token } from "./token-selector-modal";
import { SwapInputContainer } from "./swap-input-container";
import { SwapSettingsPanel, SwapSettings } from "./swap-settings";
import { showSwapToast } from "./swap-transaction-toast";
import type { Token as WalletToken } from "../../types";

interface SwapViewProps {
    walletAddress: string;
    onBack: () => void;
    walletTokens?: WalletToken[];
    initialInputToken?: Token;
}

interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: number;
}

export function SwapView({ walletAddress, onBack, walletTokens = [], initialInputToken }: SwapViewProps) {
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit: signAndSendCustodialTxFn } = useWalletSigning();

    // Fetch strictly verified tokens from our backend proxy to avoid any client CORS, extension blockers, or Cloudflare blockers
    const { data: jupiterTokens, isLoading: isLoadingTokens } = trpc.wallet.getTokens.useQuery(undefined, {
        staleTime: 1000 * 60 * 60, // 1 hour
    });

    const getQuoteMutation = trpc.wallet.getQuote.useMutation();
    const getSwapTxMutation = trpc.wallet.getSwapTransaction.useMutation();
    const reportSwapSignature = trpc.wallet.reportSwapSignature.useMutation();

    const activePublicKeyStr = adapterPublicKey?.toBase58() || walletAddress;
    const publicKey = toPublicKey(activePublicKeyStr);

    const [inputToken, setInputToken] = React.useState<Token | null>(initialInputToken ?? null);
    const [outputToken, setOutputToken] = React.useState<Token | null>(null);

    // Enrich selected token icons from Helius DAS (overrides CoinGecko logos with on-chain metadata)
    const selectedMints = React.useMemo(
        () => [inputToken?.address, outputToken?.address].filter(Boolean) as string[],
        [inputToken?.address, outputToken?.address]
    );
    const { data: heliusIcons } = trpc.wallet.getTokensByMints.useQuery(
        { ids: selectedMints },
        { enabled: selectedMints.length > 0, staleTime: 1000 * 60 * 60 }
    );
    const resolveIcon = (token: Token | null) => {
        if (!token) return token;
        const helius = heliusIcons?.[token.address];
        return helius?.logoURI ? { ...token, logoURI: helius.logoURI } : token;
    };
    const displayInputToken = resolveIcon(inputToken);
    const displayOutputToken = resolveIcon(outputToken);

    // Fetch real-time prices for selected tokens
    const { data: priceData } = trpc.wallet.getPrices.useQuery({
        ids: [inputToken?.address, outputToken?.address].filter(Boolean) as string[]
    }, {
        enabled: !!inputToken || !!outputToken,
        refetchInterval: 15000,
    });

    // wSOL (So...112) maps to native SOL (So...111) in the wallet token list
    const SOL_NATIVE = "So11111111111111111111111111111111111111111";
    const SOL_WSOL   = "So11111111111111111111111111111111111111112";

    // getPrices stores SOL under the native mint key (SOL_NATIVE), but inputToken.address is wSOL (SOL_WSOL)
    const priceKey = (address: string | undefined) =>
        !address ? "" : address === SOL_WSOL ? SOL_NATIVE : address;
    const inputPrice = priceData?.data[priceKey(inputToken?.address)]?.price || 0;
    const outputPrice = priceData?.data[priceKey(outputToken?.address)]?.price || 0;
    const inputBalance = React.useMemo(() => {
        if (!inputToken) return null;
        const lookupMint = inputToken.address === SOL_WSOL ? SOL_NATIVE : inputToken.address;
        const match = walletTokens.find(t => t.mint === lookupMint);
        return match ? match.balance : null;
    }, [inputToken, walletTokens]);
    const [inputAmount, setInputAmount] = React.useState("");
    const [outputAmount, setOutputAmount] = React.useState("");
    const [quote, setQuote] = React.useState<QuoteResponse | null>(null);
    const [isLoadingQuote, setIsLoadingQuote] = React.useState(false);
    const [isSwapping, setIsSwapping] = React.useState(false);
    const [swapSettings, setSwapSettings] = React.useState<SwapSettings>({
        slippage: "auto",
        deadline: 30,
        tradeRoute: "default",
    });

    // Initialize defaults when global token list loads
    React.useEffect(() => {
        if (jupiterTokens && !inputToken && !outputToken) {
            // CoinGecko/Jupiter token lists use wSOL (So...112), not native SOL (So...111)
            const sol = jupiterTokens.find((t: Token) =>
                t.address === "So11111111111111111111111111111111111111112" ||
                t.address === "So11111111111111111111111111111111111111111"
            );
            const usdc = jupiterTokens.find((t: Token) => t.address === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
            if (sol) setInputToken(sol);
            if (usdc) setOutputToken(usdc);
        }
    }, [jupiterTokens, inputToken, outputToken]);

    // Get quote from Backend
    const getQuote = React.useCallback(async () => {
        if (!inputToken || !outputToken || !inputAmount || parseFloat(inputAmount) <= 0) {
            setOutputAmount("");
            setQuote(null);
            return;
        }

        setIsLoadingQuote(true);
        try {
            const amount = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals));
            const slippageBps =
                swapSettings.slippage === "auto"
                    ? 50
                    : Math.round(swapSettings.slippage * 100); // e.g. 0.5% → 50 bps

            const quoteData = await getQuoteMutation.mutateAsync({
                inputMint: inputToken.address,
                outputMint: outputToken.address,
                amount: amount,
                slippageBps,
            });

            setQuote(quoteData);

            const outAmount = parseInt(quoteData.outAmount) / Math.pow(10, outputToken.decimals);
            setOutputAmount(outAmount.toFixed(6));
        } catch (error) {
            console.error("Error getting quote:", error);
            setOutputAmount("");
        } finally {
            setIsLoadingQuote(false);
        }
    }, [inputToken, outputToken, inputAmount]);

    // Debounce quote fetching
    React.useEffect(() => {
        const timer = setTimeout(() => { getQuote(); }, 500);
        return () => clearTimeout(timer);
    }, [getQuote]);

    // Execute swap
    const handleSwap = async () => {
        if (!publicKey || !quote || !inputToken || !outputToken) return;

        setIsSwapping(true);

        const swapToast = showSwapToast({
            inputSymbol: inputToken.symbol,
            outputSymbol: outputToken.symbol,
            inputAmount,
            outputAmount,
            inputIcon: displayInputToken?.logoURI,
            outputIcon: displayOutputToken?.logoURI,
        });

        try {
            const { swapTransaction, tradeId } = await getSwapTxMutation.mutateAsync({
                quoteResponse: quote,
                userPublicKey: publicKey.toString(),
                wrapAndUnwrapSol: true,
            });

            const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            swapToast.setStep("signing");
            let signature: string;
            if (adapterPublicKey) {
                signature = await sendTransaction(transaction, connection);
            } else if (walletAddress) {
                const result = await signAndSendCustodialTxFn({ transaction: swapTransaction });
                signature = result.signature;
            } else {
                throw new Error("No wallet connected");
            }

            // Attach the signature to the server-side trade record before waiting
            // on confirmation — the trade-verify cron settles it on-chain even if
            // this tab dies mid-confirm. Fire-and-forget.
            if (tradeId) reportSwapSignature.mutate({ tradeId, signature });

            swapToast.setStep("confirming");
            await connection.confirmTransaction(signature, "confirmed");

            swapToast.success(signature);
            setInputAmount("");
            setOutputAmount("");
            setQuote(null);
        } catch (error: any) {
            console.error("Swap error:", error);
            const msg = error?.message || "Something went wrong. Please try again.";
            swapToast.error(msg.includes("address table") ? "Route unavailable — try a different coin pair or amount." : msg);
        }
    };

    const handleFlipTokens = () => {
        setInputToken(outputToken);
        setOutputToken(inputToken);
        setInputAmount(outputAmount);
        setOutputAmount("");
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-center p-4 mb-2 relative">
                <Button onClick={onBack} className="absolute left-4 flex items-center gap-2 text-zinc-300 hover:text-white transition-colors bg-transparent border-none shadow-none hover:bg-transparent p-0">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <span className="text-lg font-semibold capitalize text-zinc-300">Swap</span>
                <div className="absolute right-4">
                    <SwapSettingsPanel settings={swapSettings} onChange={setSwapSettings} />
                </div>
            </div>

            <div className="px-4 pb-6 space-y-1">
                {/* Inputs Wrapper */}
                <div className="relative z-10 box-border">
                    {/* Sell Input */}
                    <SwapInputContainer
                        label="Sell"
                        amount={inputAmount}
                        onAmountChange={setInputAmount}
                        token={displayInputToken}
                        onTokenSelect={setInputToken}
                        usdValue={inputAmount && inputPrice ? (parseFloat(inputAmount) * inputPrice).toFixed(2) : ""}
                        balance={inputBalance !== null ? inputBalance.toLocaleString(undefined, { maximumFractionDigits: 6 }) : undefined}
                        jupiterTokens={jupiterTokens}
                        isLoadingTokens={isLoadingTokens}
                    />

                    {/* Flip Arrow */}
                    <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-[52%] z-20">
                        <button
                            onClick={handleFlipTokens}
                            className="p-1.5 bg-[#1b1b1c] rounded-xl hover:bg-zinc-800 transition-colors border-4 border-[#131313] text-zinc-300 hover:text-white shadow-sm flex items-center justify-center"
                        >
                            <ArrowDown className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="mt-1">
                        {/* Buy Input */}
                        <SwapInputContainer
                            label="Buy"
                            amount={outputAmount}
                            token={displayOutputToken}
                            onTokenSelect={setOutputToken}
                            usdValue={outputAmount && outputPrice ? (parseFloat(outputAmount) * outputPrice).toFixed(2) : ""}
                            readOnly
                            jupiterTokens={jupiterTokens}
                            isLoadingTokens={isLoadingTokens}
                        />
                    </div>
                </div>

                {quote && outputAmount && (
                    <div className="px-2 pt-2 pb-1 space-y-1.5">
                        <div className="flex justify-between items-center text-[13px]">
                            <span className="text-zinc-500 font-medium">Rate</span>
                            <span className="text-zinc-300 font-medium tracking-wide">
                                1 {inputToken?.symbol} ≈ {(parseFloat(outputAmount) / parseFloat(inputAmount)).toFixed(6)} {outputToken?.symbol}
                            </span>
                        </div>
                        {quote.priceImpactPct && (
                            <div className="flex justify-between items-center text-[13px]">
                                <span className="text-zinc-500 font-medium">Price Impact</span>
                                <span className={`font-semibold ${parseFloat(String(quote.priceImpactPct)) > 1 ? "text-[#f4ba40]" : "text-[#40f47e]"}`}>
                                    {parseFloat(String(quote.priceImpactPct)).toFixed(2)}%
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div className="pt-2 space-y-3">
                    {(!inputToken || !outputToken) ? (
                        <Button
                            disabled
                            className="w-full h-[60px] bg-white/10 text-white/50 text-xl font-semibold rounded-full transition-all cursor-not-allowed border-none shadow-sm"
                        >
                            Select a token
                        </Button>
                    ) : !inputAmount ? (
                        <Button
                            disabled
                            className="w-full h-[60px] bg-white/10 text-white/50 text-xl font-semibold rounded-full transition-all cursor-not-allowed border-none shadow-sm"
                        >
                            Enter an amount
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSwap}
                            disabled={!quote || isLoadingQuote || parseFloat(inputAmount) <= 0}
                            className="w-full h-[60px] bg-white hover:bg-zinc-200 text-black text-xl font-semibold rounded-full transition-all disabled:opacity-50 disabled:bg-white/50 disabled:cursor-not-allowed border-none shadow-sm"
                        >
                            {isLoadingQuote ? "Getting Quote..." : "Swap"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
