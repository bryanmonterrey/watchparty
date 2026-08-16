"use client";

// The board's buy flow. Pressing Buy used to do one of two things, neither of
// them a purchase you could see before it happened: a Solana row fired a swap
// IMMEDIATELY at whatever preset was last stored (no amount shown, no
// confirmation, no way back), and every other row opened GeckoTerminal — the
// button naming an action, then handing you to a different product to do it.
//
// This is one dialog for both: the coin, the amount, and a confirm. Nothing
// here links off-site.
//
// LAYOUT follows two references the owner picked, in watchparty's palette
// rather than theirs: the coin header and the amount-carrying CTA ("Buy $200")
// from the first, the big centred amount card with presets beneath it from the
// second. Accent is `lantern` — the app's own go/positive green — used on
// exactly one thing per state, per the one-accent-per-surface rule.

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoinImage } from "@/components/coins/coin-image";
import { ChainBadge } from "./chain-badge";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "./trending-format";
import { useQuickBuy, QUICK_BUY_PRESETS } from "@/hooks/use-quick-buy";
import { useEvmQuickBuy, EVM_BUY_PRESETS } from "@/hooks/use-evm-quick-buy";
import { useEvm } from "@/lib/chains/evm/evm-provider";
import { evmChainId } from "@/lib/chains/evm/swap";
import { trpc } from "@/lib/trpc/client";
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

const EVM_AMOUNT_KEY = "trade:quickBuyEvm";

/** The board's own slippage, stated rather than assumed — it is wider than a
 *  wallet's default because a board buy is chasing a moving coin. */
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

const usd = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n)
        ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : null;

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
    const isEvm = !!coin && evmChainId(coin.network) !== null;
    const isSolana = coin?.network === "solana";

    // Both hooks mount unconditionally — hooks cannot be called behind a branch,
    // and neither does any work until it is actually invoked.
    const { quickBuy, amountSol, setAmountSol, buyingId: solBuyingId } = useQuickBuy();
    const {
        evmBuy,
        buyingId: evmBuyingId,
        address: evmAddress,
        connected: evmConnected,
    } = useEvmQuickBuy();
    const { wallets, connect, connecting } = useEvm();

    const [evmAmount, setEvmAmount] = React.useState<number>(EVM_BUY_PRESETS[1]);

    // Restore the stored EVM amount on the client only — reading localStorage
    // during render would make SSR and hydration disagree.
    React.useEffect(() => {
        const saved = Number(localStorage.getItem(EVM_AMOUNT_KEY));
        if (EVM_BUY_PRESETS.includes(saved as (typeof EVM_BUY_PRESETS)[number])) setEvmAmount(saved);
    }, []);

    const setEvmAmountPersisted = React.useCallback((v: number) => {
        setEvmAmount(v);
        localStorage.setItem(EVM_AMOUNT_KEY, String(v));
    }, []);

    // Live estimate for EVM. Keyed by amount, so changing the preset refetches
    // and the number on screen is the number that will execute. Solana has no
    // equivalent line: Jupiter's quote returns base units with no decimals to
    // scale them by, so an estimate there would be a guess.
    const quote = trpc.evm.buyQuote.useQuery(
        {
            network: coin?.network ?? "",
            tokenAddress: coin?.tokenAddress ?? "",
            amount: evmAmount,
            fromAddress: evmAddress ?? "",
            slippageBps: SLIPPAGE_BPS,
        },
        {
            enabled: !!coin && isEvm && !!evmAddress,
            staleTime: 20_000,
            retry: false,
        },
    );

    if (!coin) return null;

    const buying = solBuyingId === coin.id || evmBuyingId === coin.id;
    const amount = isEvm ? evmAmount : amountSol;
    const presets: readonly number[] = isEvm ? EVM_BUY_PRESETS : QUICK_BUY_PRESETS;
    const setAmount = isEvm ? setEvmAmountPersisted : setAmountSol;
    const unit = isEvm ? "ETH" : "SOL";
    const spendUsd = isEvm ? usd(quote.data?.spendUsd) : null;

    const close = () => onOpenChange(false);

    const onConfirm = async () => {
        if (isSolana) {
            const result = await quickBuy({
                id: coin.id,
                tokenAddress: coin.tokenAddress,
                symbol: coin.symbol,
                imageUrl: coin.imageUrl,
            });
            // "no-wallet" already opened the wallet drawer; leaving the dialog
            // up would stack two surfaces asking for the same thing.
            if (result === "done" || result === "no-wallet") close();
            return;
        }
        if (isEvm && quote.data) {
            const result = await evmBuy(
                { id: coin.id, symbol: coin.symbol, tokenAddress: coin.tokenAddress },
                quote.data,
                String(evmAmount),
            );
            if (result === "done") close();
        }
    };

    const needsEvmWallet = isEvm && !evmConnected;
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
                        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/[0.03] px-4 pt-4 pb-4">
                            <span className="self-start text-13 font-medium text-zinc-500">
                                You&apos;re buying
                            </span>

                            <div className="flex flex-col items-center gap-0.5">
                                <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-white">
                                    {amount}
                                    <span className="ml-1.5 text-xl font-bold text-zinc-500">{unit}</span>
                                </div>
                                {/* Only when it is known: LI.FI prices the spend
                                    side, Jupiter does not, and an invented USD
                                    figure is worse than none. */}
                                {spendUsd ? (
                                    <span className="text-13 font-medium text-zinc-500">≈ {spendUsd}</span>
                                ) : null}
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
                                            // Pills stay rounded-full and are never
                                            // squircled (design principles §1).
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
                                            : quote.data
                                              ? `${formatTokens(quote.data.receiveAmount)} ${quote.data.receiveSymbol}`
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

                        {needsEvmWallet ? (
                            wallets.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    <span className="text-13 font-medium text-zinc-500">
                                        Connect a wallet to buy on {coin.network}
                                    </span>
                                    {wallets.slice(0, 3).map((w) => (
                                        <button
                                            key={w.rdns}
                                            type="button"
                                            disabled={connecting}
                                            onClick={() => void connect(w)}
                                            className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-full bg-white/5 px-4 text-15 font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={w.icon} alt="" className="size-6 rounded-md" />
                                            {w.name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-13 font-medium text-zinc-500">
                                    No EVM wallet detected. Install one to buy on {coin.network}.
                                </p>
                            )
                        ) : (
                            <button
                                type="button"
                                onClick={() => void onConfirm()}
                                disabled={buying || (isEvm && !quote.data)}
                                // h-12: a full-width CTA in a panel, per the
                                // button-height standard. The amount rides in the
                                // label so the commit and the number are one thing.
                                className="h-12 w-full cursor-pointer rounded-full bg-lantern text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {buying ? "Buying…" : `Buy ${amount} ${unit}`}
                            </button>
                        )}
                    </>
                ) : (
                    // A chain we surface but cannot fill. Says so plainly rather
                    // than sending the user off-site to do it themselves.
                    <p className="text-13 font-medium text-zinc-500">
                        {coin.network} isn&apos;t tradeable in-app yet.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
