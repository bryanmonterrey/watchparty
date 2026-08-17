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
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { useEvmQuickBuy, presetsForSymbol } from "@/hooks/use-evm-quick-buy";
import { buyableChainId } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import { trpc } from "@/lib/trpc/client";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import { PayWithSelect, PAY_WITH_CARD, payAssetKey, type PayAsset } from "./pay-with-select";
import { Squircle } from "@/components/ui/squircle";
import { HoldButton } from "@/components/ui/hold-button";
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

/** Balances report native SOL as the ...111 mint, but Jupiter routes from
 *  WRAPPED SOL (...112). One digit apart and not interchangeable: quoting
 *  against the native mint simply finds no route. */
const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111111";
const SOL_WSOL_MINT = "So11111111111111111111111111111111111111112";

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
    const { quickBuy, buyingId: solBuyingId } = useQuickBuy();
    const { evmBuy, buyingId: evmBuyingId } = useEvmQuickBuy();

    /** Contract of the token being SPENT: null = the chain's native coin. */
    const [payWith, setPayWith] = React.useState<string | null>(null);

    /** Set only once a buy actually LANDS. The button cannot infer this — the
     *  gesture completing says nothing about whether the swap filled. */
    const [succeeded, setSucceeded] = React.useState(false);

    // A dialog reopened on another coin must not still be showing the last
    // coin's success. Keyed on the coin id rather than on open/closed because
    // the component stays mounted between them.
    React.useEffect(() => {
        setSucceeded(false);
    }, [coin?.id]);

    // Spendable balances from EVERY chain, not just the coin's — cross-chain
    // routing means an ETH balance on Base can buy a coin on BNB. Two sources
    // because Solana's path carries Helius, NFTs and spam filtering that the
    // generic per-chain providers don't.
    const solAssets = trpc.wallet.getWalletAssets.useQuery(
        {},
        { enabled: !!coin, staleTime: 30_000, retry: false },
    );
    const evmAssets = trpc.wallet.getAllChainAssets.useQuery(undefined, {
        enabled: !!coin,
        staleTime: 30_000,
        retry: false,
    });

    const assets: PayAsset[] = React.useMemo(() => {
        if (!chainId) return [];

        const sol: PayAsset[] = (solAssets.data?.tokens ?? [])
            // Only what can actually pay for something.
            .filter((t) => (t.balance ?? 0) > 0)
            .map((t) => ({
                chain: "solana",
                // Native SOL is the ...111 mint in balances but Jupiter routes
                // from WRAPPED SOL, so it is normalised to `null` here and
                // re-expanded to WSOL at execution.
                contract: t.mint === SOL_NATIVE_MINT ? null : t.mint,
                symbol: t.symbol,
                decimals: t.decimals,
                balance: t.balance,
                usdValue: t.usdValue,
                icon: t.icon,
            }));

        const rest: PayAsset[] = (evmAssets.data?.assets ?? [])
            .filter((a) => a.balance > 0)
            .map((a) => ({
                chain: a.chain,
                contract: a.isNative ? null : a.contract,
                symbol: a.symbol,
                decimals: a.decimals,
                balance: a.balance,
                usdValue: a.usdValue,
                icon: a.icon,
            }));

        return (
            [...sol, ...rest]
                .map((a) => {
                    if (a.chain === chainId) return a;
                    // Bridging signs on the SOURCE, so what matters is whether
                    // we have a signer for that chain: viem for EVM, and the
                    // serialized-transaction path for Solana. Bitcoin and Sui
                    // have neither. Kept in the list and explained rather than
                    // hidden — a balance that silently vanishes reads as a bug,
                    // and "you have none" and "we can't use it" are different
                    // things the user needs to tell apart.
                    const kind = getChain(a.chain)?.kind;
                    return kind === "evm" || kind === "solana"
                        ? a
                        : { ...a, disabledReason: "can't bridge" };
                })
                // Biggest first, and anything unusable last regardless of size.
                //
                // USD value decides it when we have prices, but a wallet whose
                // tokens have no quote would tie EVERY row at 0 and leave the
                // order to chance, so raw balance breaks the tie. Same coin
                // count is a worse ranking than dollars, and a better one than
                // whatever order the providers happened to answer in.
                .sort((x, y) => {
                    if (!!x.disabledReason !== !!y.disabledReason) return x.disabledReason ? 1 : -1;
                    const byUsd = (y.usdValue ?? 0) - (x.usdValue ?? 0);
                    return byUsd !== 0 ? byUsd : (y.balance ?? 0) - (x.balance ?? 0);
                })
        );
    }, [chainId, solAssets.data, evmAssets.data]);

    const assetsLoading = solAssets.isLoading || evmAssets.isLoading;

    /**
     * No derived addresses at all — a DIFFERENT state from "no balances", and
     * the only one the user can do anything about.
     *
     * Worth distinguishing because it is common: of 31 accounts, only 7 have
     * multichain rows, and an unprovisioned account previously opened an empty
     * picker that read as a broken feature rather than as a setup step.
     */
    const noWallet = evmAssets.data?.noAddresses === true && assets.length === 0;

    // Falls back to the target chain's native coin, then to the largest usable
    // balance anywhere — a user holding only USDC on Base should not be shown
    // an empty SOL row they cannot spend.
    const payAsset =
        payWith === PAY_WITH_CARD
            ? undefined
            : assets.find((a) => payAssetKey(a) === payWith) ??
              assets.find((a) => a.chain === chainId && a.contract === null) ??
              assets.find((a) => !a.disabledReason);

    /** True when the money and the coin are on different chains — this routes
     *  through a bridge rather than a plain swap. */
    const bridging = !!payAsset && !!chainId && payAsset.chain !== chainId;

    const payingByCard = payWith === PAY_WITH_CARD;
    const spendSymbol = payAsset?.symbol ?? nativeSymbol;
    const presets = presetsForSymbol(spendSymbol);
    const [amount, setAmountState] = React.useState<number>(presets[1]);

    // Restore the stored amount for THIS spent token, on the client only —
    // reading localStorage during render would desync SSR and hydration.
    React.useEffect(() => {
        if (!spendSymbol) return;
        const list = presetsForSymbol(spendSymbol);
        const saved = Number(localStorage.getItem(amountKey(spendSymbol)));
        setAmountState(list.includes(saved) ? saved : list[1]);
    }, [spendSymbol]);

    const setAmount = React.useCallback(
        (v: number) => {
            setAmountState(v);
            if (spendSymbol) localStorage.setItem(amountKey(spendSymbol), String(v));
        },
        [spendSymbol],
    );

    // Live estimate for EVM, keyed by amount AND by what's being spent, so the
    // number on screen is the one that executes. Solana has no equivalent:
    // Jupiter returns base units with no decimals to scale them by, so the
    // figure would be a guess.
    const quote = trpc.wallet.getEvmSwapQuote.useQuery(
        {
            chain: chainId ?? "",
            fromToken: (bridging ? null : payAsset?.contract) ?? NATIVE_TOKEN,
            toToken: coin?.tokenAddress ?? "",
            amountHuman: String(amount),
            slippageBps: SLIPPAGE_BPS,
        },
        { enabled: !!coin && isEvm && !bridging && !payingByCard, staleTime: 20_000, retry: false },
    );

    // Bridged estimate. Same role as the EVM quote above but across chains, and
    // mutually exclusive with it — exactly one of the two is ever enabled.
    const crossQuote = trpc.swap.quote.useQuery(
        {
            fromChain: payAsset?.chain ?? "",
            toChain: chainId ?? "",
            fromToken: payAsset?.contract ?? NATIVE_TOKEN,
            toToken: coin?.tokenAddress ?? "",
            amountHuman: String(amount),
            slippageBps: SLIPPAGE_BPS,
        },
        { enabled: !!coin && bridging && !payingByCard && !payAsset?.disabledReason, staleTime: 20_000, retry: false },
    );

    const crossSwap = trpc.swap.execute.useMutation();

    // Card funding. Asked BEFORE drawing the entry point so an unconfigured
    // deployment renders nothing rather than a button that fails on click.
    const onramp = trpc.onramp.support.useQuery(
        { chain: chainId ?? "" },
        { enabled: !!chainId, staleTime: 300_000, retry: false },
    );
    const fundSession = trpc.onramp.createStripeSession.useMutation();

    const addFunds = React.useCallback(async () => {
        if (!chainId) return;
        const session = await fundSession.mutateAsync({ chain: chainId }).catch(() => null);
        // Stripe's hosted page is the whole flow — card entry and KYC cannot
        // happen in our UI. Unlike the GeckoTerminal redirect this replaced,
        // there is no in-app equivalent to offer instead.
        if (session?.redirectUrl) window.open(session.redirectUrl, "_blank", "noopener,noreferrer");
    }, [chainId, fundSession]);

    if (!coin) return null;

    const buying = solBuyingId === coin.id || evmBuyingId === coin.id || crossSwap.isPending;
    // Exactly one of the two queries is ever enabled, so this is a selection,
    // not a merge. Keeping it in one place stops the receive line and the CTA
    // gate from disagreeing about which route is live.
    const active = bridging ? crossQuote : quote;
    const receive = active.data ? scaleUnits(active.data.toAmount, active.data.toDecimals) : null;
    const needsQuote = (isEvm || bridging) && !payingByCard;
    // You cannot spend what you do not have, and a quote for it just wastes a
    // round trip — so this gates the CTA rather than only warning.
    const overBalance = !payingByCard && !!payAsset && amount > payAsset.balance;

    const close = () => onOpenChange(false);

    /** Show the filled state, then get out of the way. Closing on the same tick
     *  would make the success colour a frame nobody sees; the swap toast keeps
     *  reporting from there. */
    const settle = () => {
        setSucceeded(true);
        setTimeout(close, 1100);
    };

    const onConfirm = async () => {
        // Card is funding, not a swap: it puts the native coin in the wallet,
        // and the user comes back and buys with it. Stripe cannot deliver an
        // arbitrary memecoin, so this cannot be one uninterrupted flow.
        if (payingByCard) {
            await addFunds();
            return;
        }
        if (isSolana) {
            const result = await quickBuy(
                {
                    id: coin.id,
                    tokenAddress: coin.tokenAddress,
                    symbol: coin.symbol,
                    imageUrl: coin.imageUrl,
                },
                payAsset
                    ? {
                          // Native SOL normalises to `null` in the picker but
                          // Jupiter routes from WRAPPED SOL — re-expanded here.
                          mint: payAsset.contract ?? SOL_WSOL_MINT,
                          decimals: payAsset.decimals,
                          symbol: payAsset.symbol,
                          amount,
                      }
                    : undefined,
            );
            // "no-wallet" already opened the wallet drawer; leaving this up
            // would stack two surfaces asking for the same thing, so it closes
            // immediately rather than celebrating something that didn't happen.
            if (result === "no-wallet") close();
            else if (result === "done") settle();
            return;
        }
        // BRIDGED: source chain differs from the coin's, so it routes through
        // LI.FI's bridge aggregator instead of a plain swap.
        if (bridging && chainId && payAsset) {
            try {
                await crossSwap.mutateAsync({
                    fromChain: payAsset.chain,
                    toChain: chainId,
                    fromToken: payAsset.contract ?? NATIVE_TOKEN,
                    toToken: coin.tokenAddress,
                    amountHuman: String(amount),
                    slippageBps: SLIPPAGE_BPS,
                });
                settle();
            } catch {
                // The mutation's own error is rendered below; swallowing here
                // keeps a failed bridge from closing the dialog.
            }
            return;
        }
        if (isEvm && chainId) {
            const result = await evmBuy(
                { id: coin.id, symbol: coin.symbol, tokenAddress: coin.tokenAddress },
                chainId,
                String(amount),
                { token: payAsset?.contract ?? NATIVE_TOKEN, symbol: spendSymbol },
                SLIPPAGE_BPS,
            );
            if (result === "done") settle();
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
                        <Squircle asChild radius={24}>
                        <div className="flex flex-col items-center gap-3 bg-white/[0.03] p-4">
                            <span className="self-start text-13 font-medium text-zinc-500">
                                You&apos;re buying
                            </span>

                            <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-white">
                                {amount}
                                <span className="ml-1.5 text-xl font-bold text-zinc-500">{spendSymbol}</span>
                            </div>

                            <div className="grid w-full grid-cols-4 gap-2">
                                {presets.map((p) => {
                                    const active = p === amount;
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            disabled={buying || (!!payAsset && p > payAsset.balance)}
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
                        </Squircle>

                        {/* What funds it. Under the amount because it changes
                            what that amount MEANS — the presets, the big number
                            and the quote all re-key off the selected token. */}
                        <PayWithSelect
                            assets={assets}
                            loading={assetsLoading}
                            selected={payWith}
                            onSelect={setPayWith}
                            targetChain={chainId ?? undefined}
                            noWallet={noWallet}
                            onSetUpWallet={() => {
                                // The drawer owns setup; this dialog just gets
                                // out of the way so the two don't stack.
                                close();
                                window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT));
                            }}
                            cardEnabled={!!onramp.data?.supported}
                            disabled={buying}
                        />

                        <Squircle asChild radius={24}>
                        <div className="flex flex-col gap-2 bg-white/[0.03] p-4">
                            {needsQuote ? (
                                <>
                                    <Row label="You receive">
                                        {active.isLoading
                                            ? "…"
                                            : receive !== null
                                              ? `${formatTokens(receive)} ${active.data?.toSymbol ?? ""}`
                                              : "—"}
                                    </Row>
                                    {active.data?.tool ? <Row label="Route">{active.data.tool}</Row> : null}
                                    {/* Named, because a bridge is not a swap:
                                        the source receipt does not mean the
                                        funds have arrived, and the wait is
                                        real. Better seen before the hold. */}
                                    {bridging ? (
                                        <Row label="Bridge">
                                            {payAsset?.chain} → {chainId}
                                        </Row>
                                    ) : null}
                                </>
                            ) : (
                                <Row label="Market cap">{compactUsd(coin.marketCapUsd)}</Row>
                            )}
                            <Row label="24h volume">{compactUsd(coin.volume24hUsd)}</Row>
                            <Row label="Max slippage">{SLIPPAGE_BPS / 100}%</Row>
                        </div>
                        </Squircle>

                        {needsQuote && active.error ? (
                            <p className="text-13 font-medium text-pastelred">{active.error.message}</p>
                        ) : null}
                        {crossSwap.error ? (
                            <p className="text-13 font-medium text-pastelred">{crossSwap.error.message}</p>
                        ) : null}

                        {/* HOLD, not click. This button spends real money and
                            sits under a scrolling list, where a mis-tap used to
                            be one click from an unwanted trade. The label says
                            "Hold" because a button that ignores taps and
                            explains nothing reads as broken.

                            Still a rounded-full pill and never squircled, and
                            still h-12 as a full-width panel CTA. */}
                        {/* SQUIRCLED, not a pill — owner call. The Squircle
                            wraps rather than being applied via asChild because
                            HoldButton is a component, not an element, and
                            asChild clones an element's props.

                            THREE states, owner's palette: a neutral white/30
                            rest, a twitter/55 sweep as the hold fills, and
                            `long` once it lands. The success state restyles the
                            WHOLE button rather than sweeping, which is also why
                            it can flip the text to black — white on #33FDA1 is
                            about 1.4:1 and unreadable, while white is fine on
                            both of the other two. */}
                        <Squircle asChild radius={16}>
                        <div className="w-full">
                        <HoldButton
                            onConfirm={() => void onConfirm()}
                            disabled={
                                buying ||
                                overBalance ||
                                (needsQuote && !active.data) ||
                                (payingByCard && fundSession.isPending)
                            }
                            succeeded={succeeded}
                            fillClassName="bg-twitter/55"
                            successClassName="h-12 w-full bg-long text-base font-bold text-black"
                            className="h-12 w-full cursor-pointer bg-white/30 text-base font-bold text-white hover:bg-white/35 disabled:opacity-50"
                        >
                            {succeeded
                                ? "Bought"
                                : buying
                                ? "Buying…"
                                : overBalance
                                  ? `Not enough ${spendSymbol}`
                                  : payingByCard
                                    ? fundSession.isPending
                                        ? "Opening…"
                                        : `Hold to add ${nativeSymbol} with card`
                                    : `Hold to buy ${amount} ${spendSymbol}`}
                        </HoldButton>
                        </div>
                        </Squircle>

                        {fundSession.error ? (
                            <p className="text-13 font-medium text-pastelred">
                                {fundSession.error.message}
                            </p>
                        ) : null}
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
