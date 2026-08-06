"use client";

// The coin page's buy/sell panel — every coin, every chain the app trades.
//
// Anatomy follows Mobula's terminal (ProTab): a buy/sell toggle, one size
// input with preset chips (native amounts buying, % of balance selling), a
// live estimate, slippage, one big action button. Two engines behind one face:
//
//   Solana  → the existing Jupiter path (wallet.getQuote → getSwapTransaction
//             → adapter/Swig signing), the same machinery quick-buy uses — so
//             ANY mint trades, not just coins in Jupiter's token list.
//   EVM ×5  → LI.FI through wallet.getEvmSwapQuote / wallet.swapEvm; the
//             server re-quotes and signs from the seed-derived key, the same
//             trust model as sendOnChain. Notably ahead of the reference —
//             MTT ships its EVM branch as `throw "not yet implemented"`.
//
// Chains with no route (sui, bitcoin, anything unknown) keep the open-market
// card instead of a button that fails.

import * as React from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chainLabel } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import type { CoinViewData } from "./coin-detail";

const SOL_WSOL = "So11111111111111111111111111111111111111112";
/** getWalletAssets reports native SOL under this display mint. */
const SOL_DISPLAY_MINT = "So11111111111111111111111111111111111111111";

/** The coin page's network slugs (GeckoTerminal vocabulary) → chain registry
 *  ids. Anything absent has no in-app route and falls back to the market link. */
const NETWORK_TO_CHAIN: Record<string, string> = {
    solana: "solana",
    eth: "ethereum",
    ethereum: "ethereum",
    base: "base",
    polygon_pos: "polygon",
    polygon: "polygon",
    bsc: "bnb",
    bnb: "bnb",
    hyperevm: "hyperevm",
    robinhood: "robinhood",
};

const BUY_PRESETS_SOL = [0.05, 0.1, 0.5, 1];
const BUY_PRESETS_EVM = [0.01, 0.05, 0.1, 0.5];
const SELL_PRESETS_PCT = [25, 50, 75, 100];
const SLIPPAGE_PRESETS = [
    { label: "1%", bps: 100 },
    { label: "2%", bps: 200 },
    { label: "5%", bps: 500 },
];

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

/** Decimals straight from the mint account — works for any SPL mint, which is
 *  what frees selling from Jupiter's token-list metadata. */
function useMintDecimals(mint: string | null | undefined, enabled: boolean) {
    const { connection } = useConnection();
    return useQuery({
        queryKey: ["mint-decimals", mint],
        enabled: !!mint && enabled,
        staleTime: Infinity,
        queryFn: async () => {
            const info = await connection.getParsedAccountInfo(new PublicKey(mint!));
            const decimals = (info.value?.data as { parsed?: { info?: { decimals?: number } } } | null)?.parsed?.info
                ?.decimals;
            if (typeof decimals !== "number") throw new Error("no mint info");
            return decimals;
        },
    });
}

function formatAmount(n: number): string {
    if (!Number.isFinite(n) || n === 0) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
    return n.toPrecision(4);
}

/** Trim a float for the input box without scientific notation. */
function toInputAmount(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toFixed(Math.min(9, Math.max(2, 9 - Math.floor(Math.log10(Math.max(n, 1e-9))))))
        .replace(/\.?0+$/, "");
}

const CHIP =
    "h-8 cursor-pointer rounded-full px-3 text-[13px] font-bold tabular-nums transition-colors";

export function CoinTradePanel({
    coin,
    marketUrl,
    cardClassName,
}: {
    coin: CoinViewData;
    marketUrl: string | null;
    cardClassName: string;
}) {
    const chainId = NETWORK_TO_CHAIN[coin.network] ?? null;
    const chain = chainId ? getChain(chainId) : null;
    const isSolana = chainId === "solana";
    const isEvm = chain?.kind === "evm";

    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();
    const walletAddress = adapterPublicKey?.toBase58() || session?.user?.wallet_address || "";

    const [side, setSide] = React.useState<"buy" | "sell">("buy");
    const [amount, setAmount] = React.useState("");
    const [slippageBps, setSlippageBps] = React.useState(200);
    const [submitting, setSubmitting] = React.useState(false);
    const amountNum = Number(amount) || 0;
    const debouncedAmount = useDebounced(amount, 400);

    const utils = trpc.useUtils();
    const getQuote = trpc.wallet.getQuote.useMutation();
    const getSwapTx = trpc.wallet.getSwapTransaction.useMutation();
    const reportSwapSignature = trpc.wallet.reportSwapSignature.useMutation();
    const syncToken = trpc.trade.syncToken.useMutation();
    const swapEvm = trpc.wallet.swapEvm.useMutation();

    // ── Balances ────────────────────────────────────────────────────────────
    const solAssets = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress },
        { enabled: isSolana && !!walletAddress, staleTime: 30_000 },
    );
    const evmAssets = trpc.wallet.getChainAssets.useQuery(
        { chain: chainId ?? "" },
        { enabled: !!isEvm && !!session?.user, staleTime: 30_000 },
    );
    const nativeBalance = isSolana
        ? solAssets.data?.tokens?.find((t) => t.mint === SOL_DISPLAY_MINT)?.balance ?? 0
        : evmAssets.data?.assets?.find((a) => !a.contract)?.balance ?? 0;
    const coinBalance = isSolana
        ? solAssets.data?.tokens?.find((t) => t.mint === coin.tokenAddress)?.balance ?? 0
        : evmAssets.data?.assets?.find((a) => a.contract?.toLowerCase() === coin.tokenAddress.toLowerCase())
              ?.balance ?? 0;

    const mintDecimals = useMintDecimals(coin.tokenAddress, isSolana);
    const nativeSymbol = chain?.nativeCurrency.symbol ?? "SOL";
    const coinSymbol = coin.symbol.replace(/^\$/, "");

    // ── Live estimate ───────────────────────────────────────────────────────
    // Solana: Jupiter quote via the existing mutation, debounced by hand.
    const [solEstimate, setSolEstimate] = React.useState<number | null>(null);
    React.useEffect(() => {
        if (!isSolana) return;
        const amt = Number(debouncedAmount) || 0;
        const decimals = mintDecimals.data;
        if (!amt || decimals == null || !walletAddress) {
            setSolEstimate(null);
            return;
        }
        let cancelled = false;
        const base = side === "buy" ? Math.round(amt * 1e9) : Math.round(amt * 10 ** decimals);
        if (!Number.isSafeInteger(base) || base <= 0) {
            setSolEstimate(null);
            return;
        }
        getQuote
            .mutateAsync({
                inputMint: side === "buy" ? SOL_WSOL : coin.tokenAddress,
                outputMint: side === "buy" ? coin.tokenAddress : SOL_WSOL,
                amount: base,
                slippageBps,
            })
            .then((q: { outAmount?: string | number }) => {
                if (cancelled) return;
                const out = Number(q?.outAmount ?? 0);
                setSolEstimate(out / 10 ** (side === "buy" ? decimals : 9));
            })
            .catch(() => {
                if (!cancelled) setSolEstimate(null);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSolana, debouncedAmount, side, slippageBps, mintDecimals.data, walletAddress, coin.tokenAddress]);

    // EVM: server quote as a debounced query.
    const evmQuote = trpc.wallet.getEvmSwapQuote.useQuery(
        {
            chain: chainId ?? "",
            fromToken: side === "buy" ? NATIVE_TOKEN : coin.tokenAddress,
            toToken: side === "buy" ? coin.tokenAddress : NATIVE_TOKEN,
            amountHuman: debouncedAmount || "0",
            slippageBps,
        },
        {
            enabled: !!isEvm && !!session?.user && Number(debouncedAmount) > 0,
            staleTime: 15_000,
            retry: false,
        },
    );
    const evmEstimate = evmQuote.data ? Number(evmQuote.data.toAmount) / 10 ** evmQuote.data.toDecimals : null;

    const estimate = isSolana ? solEstimate : evmEstimate;
    const receiveSymbol = side === "buy" ? coinSymbol : nativeSymbol;

    // ── Execute ─────────────────────────────────────────────────────────────
    const submit = async () => {
        if (!amountNum || submitting) return;
        setSubmitting(true);
        const swapToast = showSwapToast({
            inputSymbol: side === "buy" ? nativeSymbol : coinSymbol,
            outputSymbol: side === "buy" ? coinSymbol : nativeSymbol,
            inputAmount: amount,
            outputAmount: estimate ? formatAmount(estimate) : "",
            outputIcon: side === "buy" ? coin.imageUrl ?? undefined : undefined,
        });
        try {
            if (isSolana) {
                const decimals = mintDecimals.data;
                if (decimals == null) throw new Error("Mint metadata still loading — try again in a second");
                const base = side === "buy" ? Math.round(amountNum * 1e9) : Math.round(amountNum * 10 ** decimals);
                if (!Number.isSafeInteger(base) || base <= 0) throw new Error("Amount out of range");
                const quote = await getQuote.mutateAsync({
                    inputMint: side === "buy" ? SOL_WSOL : coin.tokenAddress,
                    outputMint: side === "buy" ? coin.tokenAddress : SOL_WSOL,
                    amount: base,
                    slippageBps,
                });
                const { swapTransaction, tradeId } = await getSwapTx.mutateAsync({
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
                syncToken.mutate({ mint: coin.tokenAddress });
                utils.wallet.getWalletAssets.invalidate();
            } else {
                swapToast.setStep("confirming");
                const result = await swapEvm.mutateAsync({
                    chain: chainId!,
                    fromToken: side === "buy" ? NATIVE_TOKEN : coin.tokenAddress,
                    toToken: side === "buy" ? coin.tokenAddress : NATIVE_TOKEN,
                    amountHuman: amount,
                    slippageBps,
                });
                swapToast.success(result.txId, result.explorerUrl);
                utils.wallet.getChainAssets.invalidate({ chain: chainId! });
            }
            setAmount("");
        } catch (error) {
            swapToast.error((error as Error)?.message || "swap failed");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Gates ───────────────────────────────────────────────────────────────
    if (!chainId || (!isSolana && !isEvm) || (isEvm && !getChain(chainId))) {
        return (
            <div className={cn(cardClassName, "p-5")}>
                <h3 className="text-lg font-bold text-white">trade {coinSymbol}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    in-app swaps aren&apos;t available on {chainLabel(coin.network)} yet.
                </p>
                {marketUrl && (
                    <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85">
                        <a href={marketUrl} target="_blank" rel="noopener noreferrer">open market</a>
                    </Button>
                )}
            </div>
        );
    }

    if (!session?.user || (isSolana && !walletAddress)) {
        return (
            <div className={cn(cardClassName, "p-5")}>
                <h3 className="text-lg font-bold text-white">trade {coinSymbol}</h3>
                <p className="mt-2 text-sm text-zinc-500">connect or unlock your wallet to trade this coin.</p>
                <Button
                    onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
                    className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"
                >
                    open wallet
                </Button>
            </div>
        );
    }

    const presets = side === "buy" ? (isSolana ? BUY_PRESETS_SOL : BUY_PRESETS_EVM) : SELL_PRESETS_PCT;
    const balance = side === "buy" ? nativeBalance : coinBalance;
    const balanceSymbol = side === "buy" ? nativeSymbol : coinSymbol;
    const quoteError = isEvm && evmQuote.isError ? (evmQuote.error as { message?: string })?.message : null;
    const canSubmit = amountNum > 0 && !submitting && (!isSolana || mintDecimals.data != null);

    return (
        <div className={cn(cardClassName, "p-4")}>
            {/* buy / sell toggle — the active pill slides on the shared spring */}
            <div className="relative flex items-center rounded-full bg-white/5 p-1">
                {(["buy", "sell"] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => {
                            setSide(s);
                            setAmount("");
                        }}
                        className={cn(
                            "relative z-10 h-11 flex-1 cursor-pointer rounded-full text-base font-bold transition-colors",
                            side === s ? "text-black" : "text-zinc-400 hover:text-white",
                        )}
                    >
                        {side === s && (
                            <motion.div
                                layoutId="coinTradeSide"
                                className={cn(
                                    "absolute inset-0 -z-10 rounded-full",
                                    s === "buy" ? "bg-lantern" : "bg-pastelred",
                                )}
                                initial={false}
                                transition={{ type: "spring", stiffness: 250, damping: 30 }}
                            />
                        )}
                        {s}
                    </button>
                ))}
            </div>

            {/* size */}
            <div className="mt-4 flex items-center justify-between text-[13px] font-medium text-zinc-500">
                <span>amount</span>
                <button
                    type="button"
                    onClick={() => setAmount(toInputAmount(balance))}
                    className="cursor-pointer tabular-nums transition-colors hover:text-white"
                >
                    balance {formatAmount(balance)} {balanceSymbol}
                </button>
            </div>
            <div className="mt-1.5 flex h-12 items-center gap-2 rounded-2xl bg-white/5 px-4">
                <input
                    value={amount}
                    onChange={(e) => {
                        const v = e.target.value.replace(",", ".");
                        if (/^\d*\.?\d*$/.test(v)) setAmount(v);
                    }}
                    inputMode="decimal"
                    placeholder="0.0"
                    className="min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums text-white outline-none placeholder:text-zinc-600"
                />
                <span className="shrink-0 text-sm font-bold text-zinc-400">{balanceSymbol}</span>
            </div>

            {/* presets: native amounts buying, % of balance selling */}
            <div className="mt-2 flex items-center gap-1.5">
                {presets.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() =>
                            setAmount(side === "buy" ? String(p) : toInputAmount((coinBalance * p) / 100))
                        }
                        className={cn(CHIP, "flex-1 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white")}
                    >
                        {side === "buy" ? p : `${p}%`}
                    </button>
                ))}
            </div>

            {/* estimate */}
            <div className="mt-4 flex items-center justify-between text-[13px] font-medium">
                <span className="text-zinc-500">you receive</span>
                <span className="tabular-nums text-zinc-200">
                    {estimate != null && amountNum > 0 ? `≈ ${formatAmount(estimate)} ${receiveSymbol}` : "—"}
                </span>
            </div>
            {isEvm && evmQuote.data?.tool && amountNum > 0 && (
                <div className="mt-1 flex items-center justify-between text-[12px] font-medium text-zinc-600">
                    <span>route</span>
                    <span>{evmQuote.data.tool}</span>
                </div>
            )}

            {/* slippage */}
            <div className="mt-3 flex items-center justify-between">
                <span className="text-[13px] font-medium text-zinc-500">slippage</span>
                <div className="flex items-center gap-1">
                    {SLIPPAGE_PRESETS.map((s) => (
                        <button
                            key={s.bps}
                            type="button"
                            onClick={() => setSlippageBps(s.bps)}
                            className={cn(
                                CHIP,
                                slippageBps === s.bps
                                    ? "bg-white/15 text-white"
                                    : "text-zinc-500 hover:bg-white/5 hover:text-white",
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {quoteError && (
                <p className="mt-3 text-[13px] leading-snug text-pastelred">{quoteError}</p>
            )}

            <Button
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                    "mt-4 h-12 w-full rounded-full font-bold text-black transition-colors disabled:opacity-40",
                    side === "buy" ? "bg-lantern hover:bg-lantern/85" : "bg-pastelred hover:bg-pastelred/85",
                )}
            >
                {submitting ? "swapping…" : `${side} ${coinSymbol}`}
            </Button>

            {marketUrl && (
                <a
                    href={marketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-center text-[13px] font-medium text-zinc-500 transition-colors hover:text-white"
                >
                    open market ↗
                </a>
            )}
        </div>
    );
}
