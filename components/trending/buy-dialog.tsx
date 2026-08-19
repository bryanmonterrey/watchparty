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
// second. Accent is `twitter2` — the app's accent — used on exactly one
// thing per state. It was `lantern` here, which is the price-UP green: a
// selected preset or wallet is a choice, not a gain.

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoinImage } from "@/components/coins/coin-image";
import { ChainBadge } from "./chain-badge";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "./trending-format";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEvmQuickBuy, presetsForSymbol } from "@/hooks/use-evm-quick-buy";
import { buyableChainId } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import { trpc } from "@/lib/trpc/client";
import { WalletSetupCta } from "@/components/wallet/wallet-drawer2/views/setup/wallet-setup-cta";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import { PayWithSelect, PAY_WITH_CARD, payAssetKey, unitUsd, fmtUsd, type PayAsset } from "./pay-with-select";
import { Squircle } from "@/components/ui/squircle";
import { SettingsIcon } from "@/components/icons";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, ArrowLeft01Icon, Wallet01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { shortenWalletAddress } from "@/lib/utils";
import { HoldButton } from "@/components/ui/hold-button";
import { cn } from "@/lib/utils";
import {
    formatTokens,
    scaleUnits,
    amountKey,
    USD_PRESETS,
    USD_AMOUNT_KEY,
    SLIPPAGE_OPTIONS,
    DEFAULT_SLIPPAGE_BPS,
    SLIPPAGE_KEY,
    SOL_NATIVE_MINT,
    SOL_WSOL_MINT,
} from "./buy-format";

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
    liquidityUsd?: number | null;
};







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
    const utils = trpc.useUtils();
    const { quickBuy, buyingId: solBuyingId } = useQuickBuy();
    const { evmBuy, buyingId: evmBuyingId } = useEvmQuickBuy();

    /** Contract of the token being SPENT: null = the chain's native coin. */
    const [payWith, setPayWith] = React.useState<string | null>(null);

    /** Set only once a buy actually LANDS. The button cannot infer this — the
     *  gesture completing says nothing about whether the swap filled. */
    const [succeeded, setSucceeded] = React.useState(false);

    /** Buy settings, in a popover off the amount card's corner. */
    const [slippageBps, setSlippageBpsState] = React.useState<number>(DEFAULT_SLIPPAGE_BPS);

    React.useEffect(() => {
        const saved = Number(localStorage.getItem(SLIPPAGE_KEY));
        if ((SLIPPAGE_OPTIONS as readonly number[]).includes(saved)) setSlippageBpsState(saved);
    }, []);

    const setSlippageBps = React.useCallback((v: number) => {
        setSlippageBpsState(v);
        localStorage.setItem(SLIPPAGE_KEY, String(v));
    }, []);

    // A dialog reopened on another coin must not still be showing the last
    // coin's success. Keyed on the coin id rather than on open/closed because
    // the component stays mounted between them.
    React.useEffect(() => {
        setSucceeded(false);
    }, [coin?.id]);

    // WHICH wallet is being spent from. An account can hold several linked
    // Solana wallets and `user.wallet_address` mirrors only the primary, so
    // without this the dialog reads the embedded wallet while the money sits in
    // a linked extension one.
    const { wallets, active, setActive } = useActiveWallet(!!coin);

    /** Which pane is showing. The wallet list is a PAGE, not a popover: it is a
     *  full decision with its own list, and layering it over the buy would hide
     *  the thing being paid for. */
    const [view, setView] = React.useState<"buy" | "wallets">("buy");

    // A dialog reopened on another coin must start on the buy pane.
    React.useEffect(() => {
        setView("buy");
    }, [coin?.id]);
    const { publicKey: adapterPublicKey } = useWallet();

    // Spendable balances from EVERY chain, not just the coin's — cross-chain
    // routing means an ETH balance on Base can buy a coin on BNB. Two sources
    // because Solana's path carries Helius, NFTs and spam filtering that the
    // generic per-chain providers don't.
    //
    // Explicitly addressed to the ACTIVE wallet rather than defaulting to the
    // session's primary — that default is the bug this replaces.
    const solAssets = trpc.wallet.getWalletAssets.useQuery(
        active ? { address: active.address } : {},
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
     * No wallet at all — a DIFFERENT state from "no balances", and the only one
     * the user can do anything about.
     *
     * Worth distinguishing because it is the common case: of 31 accounts, only
     * 7 have multichain rows, so an unprovisioned account is what MOST people
     * open this dialog with.
     *
     * Read from two independent signals, because relying on either alone fails
     * silently into "No balances" — which is exactly what shipped first:
     *   - `noAddresses` from getAllChainAssets is authoritative, but it is a
     *     field on a payload, so a failed or slow query makes it `undefined`
     *     rather than false, and `undefined === true` is quietly not-no-wallet.
     *   - getWalletAssets THROWS ("No wallet address provided") when the legacy
     *     Solana column is null, so its error is itself evidence — and it
     *     survives the case where the first query is the one that failed.
     *
     * Gated on both queries having settled, so it can never flash setup at
     * someone who simply has not loaded yet.
     */
    const noWallet =
        !assetsLoading &&
        assets.length === 0 &&
        (evmAssets.data?.noAddresses === true || (solAssets.isError && !evmAssets.data));

    /**
     * Why the list is empty, said out loud.
     *
     * "No balances" was being rendered for three different reasons — genuinely
     * nothing held, the queries failed, and no wallet exists — and collapsing
     * them is why the last fix could not be diagnosed from the screen. Each
     * now names itself, so the UI is its own instrument.
     */
    const emptyReason = assetsLoading
        ? undefined
        : assets.length > 0
          ? undefined
          : evmAssets.isError && solAssets.isError
            ? "Couldn't load balances"
            : evmAssets.isError
              ? "Couldn't load other chains"
              : solAssets.isError && !evmAssets.data
                ? "Couldn't load balances"
                : "No balances";

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
    /**
     * Presets are DOLLARS, not token units.
     *
     * "0.05 / 0.1 / 0.5 / 1" asked the user to price the token in their head
     * before they could pick an amount, and the right numbers differed per
     * coin — 0.05 is ~$95 of ETH and ~2 cents of POL. $10/$25/$50/$100 means
     * the same thing whatever is being spent, which is the point.
     *
     * The token amount is DERIVED from the dollar amount using the unit price
     * the holding already implies, so no extra price query and no possibility
     * of disagreeing with the balance shown beside it.
     */
    const unitPrice = payAsset ? unitUsd(payAsset) : null;
    /** Only when the spent token has a known price — a token we can't price
     *  cannot be bought in dollars, so it falls back to token presets. */
    const pricedInUsd = !!unitPrice && unitPrice > 0;

    const tokenPresets = presetsForSymbol(spendSymbol);
    const [usdAmount, setUsdAmount] = React.useState<number>(USD_PRESETS[1]);
    const [tokenAmount, setTokenAmount] = React.useState<number>(tokenPresets[1]);

    // Restore on the client only — reading localStorage during render would
    // desync SSR and hydration. The dollar choice is remembered ACROSS tokens
    // (it means the same everywhere); the token fallback stays per-symbol.
    React.useEffect(() => {
        const savedUsd = Number(localStorage.getItem(USD_AMOUNT_KEY));
        if ((USD_PRESETS as readonly number[]).includes(savedUsd)) setUsdAmount(savedUsd);
    }, []);
    React.useEffect(() => {
        if (!spendSymbol) return;
        const list = presetsForSymbol(spendSymbol);
        const saved = Number(localStorage.getItem(amountKey(spendSymbol)));
        setTokenAmount(list.includes(saved) ? saved : list[1]);
    }, [spendSymbol]);

    const presets: readonly number[] = pricedInUsd ? USD_PRESETS : tokenPresets;
    const selectedPreset = pricedInUsd ? usdAmount : tokenAmount;

    const setAmount = React.useCallback(
        (v: number) => {
            if (pricedInUsd) {
                setUsdAmount(v);
                localStorage.setItem(USD_AMOUNT_KEY, String(v));
                return;
            }
            setTokenAmount(v);
            if (spendSymbol) localStorage.setItem(amountKey(spendSymbol), String(v));
        },
        [pricedInUsd, spendSymbol],
    );

    /**
     * The token amount that actually gets spent.
     *
     * Rounded to the token's own decimals: an unrounded quotient like
     * 0.11834321098765432 is more precision than the mint can represent, and it
     * reaches the base-unit conversion as a float that has to be truncated
     * anyway — better to do it here, where the number shown and the number sent
     * are the same one.
     */
    const amount = React.useMemo(() => {
        if (!pricedInUsd || !unitPrice) return tokenAmount;
        const raw = usdAmount / unitPrice;
        const dp = Math.min(payAsset?.decimals ?? 9, 9);
        return Number(raw.toFixed(dp));
    }, [pricedInUsd, unitPrice, usdAmount, tokenAmount, payAsset?.decimals]);

    /** What the spend is worth, numerically — the headline when we can price it. */
    const spendUsdValue = pricedInUsd ? usdAmount : (unitUsd(payAsset ?? { balance: 0 }) ?? 0) * amount;
    const spendUsd = fmtUsd(spendUsdValue);

    /** How much of the pool this trade is. A large fraction moves the price
     *  against you and is hard to exit; a small one is noise. */
    const depthRatio =
        coin?.liquidityUsd && coin.liquidityUsd > 0 ? spendUsdValue / coin.liquidityUsd : 0;


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
            slippageBps,
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
            slippageBps,
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
    const activeQuote = bridging ? crossQuote : quote;
    const receive = activeQuote.data ? scaleUnits(activeQuote.data.toAmount, activeQuote.data.toDecimals) : null;

    /**
     * HOW MUCH OF THE COIN this buys — the thing actually being bought.
     *
     * The secondary line used to restate the spend in the payment token, which
     * the big number above it already said. What someone wants under "you're
     * paying $25" is "…for 1.2M PEPE".
     *
     * A real quote wins when there is one: it accounts for slippage, fees and
     * the actual route. Where there isn't — Solana same-chain, because Jupiter
     * returns base units with no decimals to scale them by — it falls back to
     * the coin's own listed price, which is the same derivation used for the
     * spend value and needs no extra request. Marked "≈" either way, because
     * both are estimates.
     */
    const receiveEstimate =
        receive !== null
            ? receive
            : coin && coin.priceUsd && spendUsdValue > 0
              ? spendUsdValue / coin.priceUsd
              : null;
    const needsQuote = (isEvm || bridging) && !payingByCard;
    // You cannot spend what you do not have, and a quote for it just wastes a
    // round trip — so this gates the CTA rather than only warning.
    const overBalance =
        !payingByCard &&
        !!payAsset &&
        (pricedInUsd ? usdAmount > (payAsset.usdValue ?? 0) : amount > payAsset.balance);

    /**
     * Can the ACTIVE wallet actually sign right now?
     *
     * Only ONE case can't: an extension wallet whose extension isn't connected,
     * because nothing in the browser can produce that signature. The embedded
     * wallet is always available, connected extension or not — `quickBuy` is
     * told which wallet to use rather than defaulting to whichever is plugged
     * in, so the two coexist and no one is asked to disconnect anything.
     */
    const adapter = adapterPublicKey?.toBase58() ?? null;
    const needsExtension =
        !!active && isSolana && active.source === "extension" && adapter !== active.address;

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
                          // Named explicitly so a connected extension can't
                          // hijack a buy the user aimed at the embedded wallet.
                          signWith: active?.source === "extension" ? "adapter" : "embedded",
                          signerAddress: active?.address,
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
                    slippageBps,
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
                slippageBps,
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

                {/* Two panes on one track: buy, and the wallet list. Slid with
                    `translateX`, not by swapping the DOM — the transform stays
                    on the compositor and the outgoing pane is still there to
                    animate, which a conditional render cannot do.

                    The coin header above is deliberately OUTSIDE this, so the
                    thing being bought never leaves the screen while choosing
                    which wallet pays for it. */}
                <div className="overflow-hidden">
                <div
                    className="flex w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{ transform: view === "wallets" ? "translateX(-50%)" : "translateX(0)" }}
                >
                <div className="flex w-1/2 shrink-0 flex-col gap-3" aria-hidden={view !== "buy"}>
                {noWallet ? (
                    /* SETUP IN PLACE, not a redirect and not a second modal.
                       The coin header above stays put, so the purchase the user
                       started is still visible and still the subject: they are
                       not told to go somewhere else and come back, and there is
                       nothing to dismiss. `onCreated` refetches the balances so
                       this same dialog continues straight into the buy. */
                    <div className="flex flex-col gap-3">
                        <p className="text-13 font-medium text-zinc-500">
                            You&apos;ll need a wallet to buy {coin.symbol}. It takes a second, and
                            you keep the keys.
                        </p>
                        <WalletSetupCta
                            variant="inline"
                            onCreated={() => {
                                void utils.wallet.getAllChainAssets.invalidate();
                                void utils.wallet.getWalletAssets.invalidate();
                            }}
                        />
                    </div>
                ) : tradeable ? (
                    <>
                        {/* The amount, as the thing the dialog is actually about. */}
                        <Squircle asChild radius={24}>
                        <div className="flex flex-col items-center gap-3 bg-white/[0.03] p-4">
                            {/* "You're PAYING", not "buying".
                                The big number is what LEAVES the wallet, and
                                labelling it "You're buying 1 SOL" said the
                                opposite of what happens — the coin is what's
                                being bought, SOL is what it costs. */}
                            <div className="flex w-full items-start justify-between">
                                <span className="text-13 font-medium text-zinc-500">
                                    You&apos;re paying
                                </span>
                                {/* Opens in the card's own corner rather than a
                                    separate surface: the thing being configured
                                    is right here. */}
                                {/* A POPOVER, not a swap of the preset row.
                                    Settings are a side errand; taking over the
                                    amount controls to show them made the main
                                    thing disappear to configure it. */}
                                <GooDropdown
                                    align="end"
                                    width={220}
                                    gap={8}
                                    fill={GOO_PANEL_FILL}
                                    triggerAriaLabel="Buy settings"
                                    triggerClassName="-mt-1 -mr-1 cursor-pointer rounded-full p-1 text-zinc-500 transition-colors hover:text-white"
                                    trigger={<SettingsIcon filled className="size-5" />}
                                    items={SLIPPAGE_OPTIONS.map((bps) =>
                                        gooMenuItem({
                                            key: bps,
                                            label: `${bps / 100}% slippage`,
                                            onClick: () => setSlippageBps(bps),
                                            right:
                                                bps === slippageBps ? (
                                                    <HugeiconsIcon
                                                        icon={Tick02Icon}
                                                        className="size-4 text-white"
                                                        strokeWidth={2}
                                                    />
                                                ) : undefined,
                                        }),
                                    )}
                                />
                            </div>

                            {/* DOLLARS lead when we can price the token, with
                                the token amount as the conversion beneath —
                                the same order the presets are in, so the number
                                you picked is the number you see. Falls back to
                                token-first for anything we can't price. */}
                            <div className="flex flex-col items-center gap-0.5">
                                <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-white">
                                    {pricedInUsd ? (
                                        spendUsd
                                    ) : (
                                        <>
                                            {amount}
                                            <span className="ml-1.5 text-xl font-bold text-zinc-500">
                                                {spendSymbol}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <span className="text-13 font-medium text-zinc-500">
                                    {receiveEstimate !== null
                                        ? `≈ ${formatTokens(receiveEstimate)} ${coin.symbol}`
                                        : pricedInUsd
                                          ? `≈ ${formatTokens(amount)} ${spendSymbol}`
                                          : spendUsd
                                            ? `≈ ${spendUsd}`
                                            : null}
                                </span>
                            </div>

                            <div className="grid w-full grid-cols-4 gap-2">
                                {presets.map((p) => {
                                    const active = p === selectedPreset;
                                    return (
                                        // autoEffects={false}: with it on, Squircle injects a wrapper
                                        // div that becomes the GRID CHILD, leaving the button
                                        // inside with no width at all. These have no border
                                        // for the effects to preserve, so there is nothing to
                                        // trade away.
                                        <Squircle asChild autoEffects={false} radius={14} key={p}>
                                        <button
                                            type="button"
                                            // Compared in whatever unit the
                                            // preset is in — dollars against the
                                            // holding's value, tokens against
                                            // its balance. Mixing the two was
                                            // how "$100" got disabled for a
                                            // wallet holding 2 SOL.
                                            disabled={
                                                buying ||
                                                (!!payAsset &&
                                                    (pricedInUsd
                                                        ? p > (payAsset.usdValue ?? 0)
                                                        : p > payAsset.balance))
                                            }
                                            onClick={() => setAmount(p)}
                                            // Pills stay rounded-full and are
                                            // never squircled (principles §1).
                                            className={cn(
                                                // Squircled, not a pill — owner's
                                                // call. Squircle applies the shape
                                                // by clip-path, so no rounded-*.
                                                "h-11 cursor-pointer text-15 font-bold tabular-nums transition-colors disabled:opacity-50",
                                                active
                                                    ? "bg-twitter2/15 text-twitter2"
                                                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                            )}
                                        >
                                            {pricedInUsd ? `$${p}` : p}
                                        </button>
                                        </Squircle>
                                    );
                                })}
                            </div>
                        </div>
                        </Squircle>

                        {/* Caption OUT of the control, sharing its row with the
                            wallet switcher.

                            The switcher is labelled with the CURRENT wallet, not
                            with "Switch wallet": an action label tells you what
                            happens but not where you are, so you would have to
                            open it just to learn which wallet you are spending
                            from. Showing the wallet answers that and invites the
                            change in the same breath. */}
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-13 font-medium text-zinc-500">Pay with</span>
                            {active ? (
                                <button
                                    type="button"
                                    onClick={() => setView("wallets")}
                                    className="flex cursor-pointer items-center gap-1.5 text-13 font-semibold text-zinc-400 transition-colors hover:text-white"
                                >
                                    <HugeiconsIcon
                                        icon={Wallet01Icon}
                                        className="size-4 shrink-0"
                                        strokeWidth={2}
                                    />
                                    {active.name}
                                    <HugeiconsIcon
                                        icon={ArrowRight01Icon}
                                        className="size-4 shrink-0"
                                        strokeWidth={2}
                                    />
                                </button>
                            ) : null}
                        </div>
                        {/* What funds it. Under the amount because it changes
                            what that amount MEANS — the presets, the big number
                            and the quote all re-key off the selected token. */}
                        <PayWithSelect
                            assets={assets}
                            loading={assetsLoading}
                            selected={payWith}
                            onSelect={setPayWith}
                            targetChain={chainId ?? undefined}
                            emptyReason={emptyReason}
                            cardEnabled={!!onramp.data?.supported}
                            disabled={buying}
                        />

                        <Squircle asChild radius={24}>
                        <div className="flex flex-col gap-2 bg-white/[0.03] p-4">
                            {/* LIQUIDITY, always.
                                Market cap was context, not a decision — it does
                                not change whether to press the button. Depth
                                does: it is what says whether this can be sold
                                again, it is the number behind every junk row we
                                filter, and unlike a quote it exists on every
                                chain, so Solana is not left with an empty card.

                                Tinted against THIS trade, not an absolute bar —
                                $25 is nothing in a $2M pool and most of a $400
                                one. */}
                            {typeof coin.liquidityUsd === "number" ? (
                                <Row label="Liquidity">
                                    <span className={cn(depthRatio > 0.05 && "text-pastelred", depthRatio > 0.02 && depthRatio <= 0.05 && "text-sunset")}>
                                        {compactUsd(coin.liquidityUsd)}
                                    </span>
                                </Row>
                            ) : null}
                            {needsQuote ? (
                                <>
                                    {/* The floor, not the estimate: what lands
                                        even if the price moves the full slippage
                                        allowance. The headline above is the
                                        expectation; this is the guarantee. */}
                                    {activeQuote.data?.toAmountMin ? (
                                        <Row label="At least">
                                            {formatTokens(
                                                scaleUnits(
                                                    activeQuote.data.toAmountMin,
                                                    activeQuote.data.toDecimals,
                                                ),
                                            )}{" "}
                                            {activeQuote.data.toSymbol}
                                        </Row>
                                    ) : null}
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
                            ) : null}
                        </div>
                        </Squircle>

                        {needsQuote && activeQuote.error ? (
                            <p className="text-13 font-medium text-pastelred">{activeQuote.error.message}</p>
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
                                needsExtension ||
                                overBalance ||
                                (needsQuote && !activeQuote.data) ||
                                (payingByCard && fundSession.isPending)
                            }
                            succeeded={succeeded}
                            fillClassName="bg-twitter/55"
                            successClassName="h-14 w-full bg-long text-base font-bold text-black"
                            className="h-14 w-full cursor-pointer bg-white/30 text-base font-bold text-white hover:bg-white/35 disabled:opacity-50"
                        >
                            {succeeded
                                ? "Bought"
                                : needsExtension
                                ? `Connect ${active?.name ?? "that wallet"} to spend from it`
                                : buying
                                ? "Buying…"
                                : overBalance
                                  ? `Not enough ${spendSymbol}`
                                  : payingByCard
                                    ? fundSession.isPending
                                        ? "Opening…"
                                        : `Hold to add ${nativeSymbol} with card`
                                    : pricedInUsd
                                      ? `Hold to buy ${spendUsd} of ${coin.symbol}`
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
                </div>

                {/* WALLET PANE */}
                <div className="flex w-1/2 shrink-0 flex-col gap-3" aria-hidden={view !== "wallets"}>
                    <button
                        type="button"
                        onClick={() => setView("buy")}
                        className="flex w-fit cursor-pointer items-center gap-1.5 text-13 font-semibold text-zinc-400 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
                        Back
                    </button>

                    <div className="flex flex-col gap-1">
                        {wallets.map((w) => {
                            const isActive = active?.address === w.address;
                            return (
                                <Squircle asChild radius={16} key={w.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActive(w.address);
                                            // Straight back — choosing IS the
                                            // action, so a second confirming tap
                                            // would be ceremony.
                                            setView("buy");
                                        }}
                                        className={cn(
                                            "flex h-14 w-full cursor-pointer items-center gap-3 px-3.5 text-left transition-colors",
                                            isActive
                                                ? "bg-twitter2/12 text-twitter2"
                                                : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                                        )}
                                    >
                                        <HugeiconsIcon
                                            icon={Wallet01Icon}
                                            className="size-5 shrink-0"
                                            strokeWidth={2}
                                        />
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate text-15 font-bold">{w.name}</span>
                                            {/* The address is what actually
                                                distinguishes two wallets that
                                                share a source name. Through the
                                                canonical shortener — the one
                                                place allowed to truncate one. */}
                                            <span className="truncate text-13 font-medium text-zinc-500">
                                                {shortenWalletAddress(w.address)}
                                            </span>
                                        </span>
                                        {w.isPrimary ? (
                                            <span className="ml-auto shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-zinc-400">
                                                Main
                                            </span>
                                        ) : null}
                                    </button>
                                </Squircle>
                            );
                        })}
                    </div>
                </div>
                </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
