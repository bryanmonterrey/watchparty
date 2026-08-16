"use client";

// The board's buy flow. Pressing Buy used to do one of two things, neither of
// them a purchase you could see before it happened: a Solana row fired a swap
// IMMEDIATELY at whatever preset was last stored (no amount shown, no
// confirmation, no way back), and every other row opened GeckoTerminal — the
// button naming an action, then handing you to a different product to do it.
//
// This is one dialog for every chain we hold keys for: the coin, the amount,
// and a confirm. Nothing here links off-site.
//
// COVERAGE is decided by two lists that are deliberately different sizes. The
// board TRENDS ~20 chains; the wallet holds keys for 8. `buyableChainId()` maps
// the first onto the second and returns null for the rest, so a display-only
// row says so instead of offering a button that throws. Solana routes through
// Jupiter, every EVM chain (Ethereum, Base, Polygon, BNB, HyperEVM, Robinhood)
// through LI.FI — see `lib/chains/swap`.
//
// LAYOUT follows two references the owner picked, in watchparty's palette
// rather than theirs: the coin header and the amount-carrying CTA ("Buy $200")
// from the first, the big centred amount card with presets beneath it from the
// second. Accent is `lantern`, used on exactly one thing per state.

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoinImage } from "@/components/coins/coin-image";
import { ChainBadge } from "./chain-badge";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "./trending-format";
import { useQuickBuy, QUICK_BUY_PRESETS } from "@/hooks/use-quick-buy";
import { useEvmQuickBuy, presetsForSymbol } from "@/hooks/use-evm-quick-buy";
import { buyableChainId } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import { trpc } from "@/lib/trpc/client";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import { cn } from "@/lib/utils";

/** Only what the dialog draws — deliberately not the trending row type, so the
 *  coin page or a rail can open the same dialog without owning that shape. */
export type BuyDialogCoin = {
    id: string;
    network: string;
    tokenAddress: string;
    symbol: string;
    name?: string | null;
    imageUrl?: string | null;
    priceUsd?: number | null;
    priceChange24h?: number | null;
    marketCapUsd?: number | null;
    volume24hUsd?: number | null;
};

/** Keyed by native symbol, not by chain: Base, Ethereum and Robinhood all spend
 *  ETH, and someone who picked 0.01 ETH on one means it on the others. */
const amountKey = (symbol: string) => `trade:quickBuy:${symbol}`;

/** The board's own slippage, stated rather than assumed — wider than a wallet's
 *  default because a board buy is chasing a moving coin. */
const SLIPPAGE_BPS = 200;

/**
 * Token counts span from millions of a memecoin to fractions of a blue chip, so
 * a fixed precision is wrong at one end or the other: 4 decimals renders
 * "1,234,567.0000", and 0 renders a real 0.0421 position as "0".
 */
function formatTokens(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Base units -> display units on the STRING, never `Number(raw) / 10 ** dp`.
 * An 18-decimal token passes 2^53 at a single whole token, so the float path
 * silently drops low-order digits on any real balance.
 */
function scaleUnits(raw: string, decimals: number): number {
    if (!/^\d+$/.test(raw)) return 0;
    if (decimals <= 0) return Number(raw);
    const padded = raw.padStart(decimals + 1, "0");
    return Number(`${padded.slice(0, padded.length - decimals)}.${padded.slice(padded.length - decimals)}`);
}

/** One labelled line in the details block. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-13 font-medium text-zinc-500">{label}</span>
            <span className="text-13 font-semibold tabular-nums text-white">{children}</span>
        </div>
    );
}

export function BuyDialog({
    coin,
    onOpenChange,
}: {
    coin: BuyDialogCoin | null;
    onOpenChange: (open: boolean) => void;
}) {
    const chainId = coin ? buyableChainId(coin.network) : null;
    const chain = chainId ? getChain(chainId) : undefined;
    const isSolana = chainId === "solana";
    const isEvm = !!chain && chain.kind === "evm";
    const nativeSymbol = chain?.nativeCurrency.symbol ?? "";

    // Hooks cannot sit behind a branch, so both mount; neither does any work
    // until it is actually invoked.
    const { quickBuy, amountSol, setAmountSol, buyingId: solBuyingId } = useQuickBuy();
    const { evmBuy, buyingId: evmBuyingId } = useEvmQuickBuy();

    const presets = isSolana ? QUICK_BUY_PRESETS : presetsForSymbol(nativeSymbol);
    const [evmAmount, setEvmAmount] = React.useState<number>(presets[1]);

    // Restore the stored amount for THIS native coin, on the client only —
    // reading localStorage during render would desync SSR and hydration.
    React.useEffect(() => {
        if (!nativeSymbol || isSolana) return;
        const list = presetsForSymbol(nativeSymbol);
        const saved = Number(localStorage.getItem(amountKey(nativeSymbol)));
        setEvmAmount(list.includes(saved) ? saved : list[1]);
    }, [nativeSymbol, isSolana]);

    const setEvmAmountPersisted = React.useCallback(
        (v: number) => {
            setEvmAmount(v);
            if (nativeSymbol) localStorage.setItem(amountKey(nativeSymbol), String(v));
        },
        [nativeSymbol],
    );

    const amount = isSolana ? amountSol : evmAmount;

    // Live estimate for EVM, keyed by amount so the number on screen is the one
    // that executes. Solana has no equivalent: Jupiter returns base units with
    // no decimals to scale them by, so the figure would be a guess.
    const quote = trpc.wallet.getEvmSwapQuote.useQuery(
        {
            chain: chainId ?? "",
            fromToken: NATIVE_TOKEN,
            toToken: coin?.tokenAddress ?? "",
            amountHuman: String(amount),
            slippageBps: SLIPPAGE_BPS,
        },
        { enabled: !!coin && isEvm, staleTime: 20_000, retry: false },
    );

    if (!coin) return null;

    const buying = solBuyingId === coin.id || evmBuyingId === coin.id;
    const setAmount = isSolana ? setAmountSol : setEvmAmountPersisted;
    const receive = quote.data ? scaleUnits(quote.data.toAmount, quote.data.toDecimals) : null;

    const close = () => onOpenChange(false);

    const onConfirm = async () => {
        if (isSolana) {
            const result = await quickBuy({
                id: coin.id,
                tokenAddress: coin.tokenAddress,
                symbol: coin.symbol,
                imageUrl: coin.imageUrl,
            });
            // "no-wallet" already opened the wallet drawer; leaving this up
            // would stack two surfaces asking for the same thing.
            if (result === "done" || result === "no-wallet") close();
            return;
        }
        if (isEvm && chainId) {
            const result = await evmBuy(
                { id: coin.id, symbol: coin.symbol, tokenAddress: coin.tokenAddress },
                chainId,
                String(amount),
                nativeSymbol,
                SLIPPAGE_BPS,
            );
            if (result === "done") close();
        }
    };

    const tradeable = isSolana || isEvm;

    return (
        <Dialog open={!!coin} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm gap-3">
                <DialogTitle className="sr-only">Buy {coin.symbol}</DialogTitle>

                {/* Identity. pr-10 keeps it clear of the close button. */}
                <div className="flex items-center gap-3 pr-10">
                    <CoinImage
                        src={coin.imageUrl}
                        alt={coin.symbol}
                        coin={coin.tokenAddress}
                        className="size-11 shrink-0 rounded-full"
                    />
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="truncate text-lg font-bold text-white">{coin.symbol}</span>
                            <ChainBadge network={coin.network} className="size-4 shrink-0" />
                        </div>
                        {coin.name ? (
                            <div className="truncate text-13 text-zinc-500">{coin.name}</div>
                        ) : null}
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                        <div className="text-15 font-bold tabular-nums text-white">
                            {tokenPrice(coin.priceUsd)}
                        </div>
                        <div
                            className={cn(
                                "text-13 font-semibold tabular-nums",
                                changeTone(coin.priceChange24h),
                            )}
                        >
                            {percentAbs(coin.priceChange24h)}
                        </div>
                    </div>
                </div>

                {tradeable ? (
                    <>
                        {/* The amount, as the thing the dialog is actually about. */}
                        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/[0.03] p-4">
                            <span className="self-start text-13 font-medium text-zinc-500">
                                You&apos;re buying
                            </span>

                            <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-white">
                                {amount}
                                <span className="ml-1.5 text-xl font-bold text-zinc-500">{nativeSymbol}</span>
                            </div>

                            <div className="grid w-full grid-cols-4 gap-2">
                                {presets.map((p) => {
                                    const active = p === amount;
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            disabled={buying}
                                            onClick={() => setAmount(p)}
                                            // Pills stay rounded-full and are
                                            // never squircled (principles §1).
                                            className={cn(
                                                "h-11 cursor-pointer rounded-full text-15 font-bold tabular-nums transition-colors disabled:opacity-50",
                                                active
                                                    ? "bg-lantern/15 text-lantern"
                                                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                            )}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-3xl bg-white/[0.03] p-4">
                            {isEvm ? (
                                <>
                                    <Row label="You receive">
                                        {quote.isLoading
                                            ? "…"
                                            : receive !== null
                                              ? `${formatTokens(receive)} ${quote.data?.toSymbol ?? ""}`
                                              : "—"}
                                    </Row>
                                    {quote.data?.tool ? <Row label="Route">{quote.data.tool}</Row> : null}
                                </>
                            ) : (
                                <Row label="Market cap">{compactUsd(coin.marketCapUsd)}</Row>
                            )}
                            <Row label="24h volume">{compactUsd(coin.volume24hUsd)}</Row>
                            <Row label="Max slippage">{SLIPPAGE_BPS / 100}%</Row>
                        </div>

                        {quote.error && isEvm ? (
                            <p className="text-13 font-medium text-pastelred">{quote.error.message}</p>
                        ) : null}

                        <button
                            type="button"
                            onClick={() => void onConfirm()}
                            disabled={buying || (isEvm && !quote.data)}
                            // h-12: a full-width CTA in a panel, per the button
                            // height standard. The amount rides in the label so
                            // the commit and the number are one thing.
                            className="h-12 w-full cursor-pointer rounded-full bg-lantern text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {buying ? "Buying…" : `Buy ${amount} ${nativeSymbol}`}
                        </button>
                    </>
                ) : (
                    // On the board but not in the wallet registry: we can show
                    // this coin and cannot hold its chain's keys. Say so, rather
                    // than sending the user off-site to do it themselves.
                    <p className="text-13 font-medium text-zinc-500">
                        {coin.network} isn&apos;t buyable in-app yet — no wallet on that chain.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
