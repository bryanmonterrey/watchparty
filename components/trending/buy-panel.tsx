"use client";

// The buy flow's BODY — one component behind two surfaces: the trending
// board's <BuyDialog> and the coin page's swap card. They used to be two
// implementations of the same purchase (the card had its own input box, chip
// row, slippage row and Jupiter/LI.FI wiring), which is how they drifted apart
// visibly. Now the card IS the dialog minus the modal chrome, and a fix lands
// in both.
//
// What lives here: the amount card with dollar presets, the wallet switcher
// (a slide-in pane, not a popover), the pay-with picker, the details block, and
// the hold-to-confirm CTA. What doesn't: the coin header — the dialog draws it
// above this, and the coin page already has one.
//
// SELL is the one thing the card has that the dialog does not. It is the same
// anatomy with the roles reversed: the coin you hold is what leaves, the
// chain's native coin is what arrives, and the presets are a share of the
// position rather than dollars — "$25" of something you may hold $12 of is the
// wrong question. Both engines already take any input token, so a sell is a
// buy with the mints swapped and nothing new underneath.
//
// The DETAILS block is swap information — rate, floor, slippage, route — and
// not market data. Market cap (and liquidity as a number) belong to the coin,
// not to this transaction; a depth warning still appears when the trade is a
// meaningful share of the pool, because that IS about this transaction.
//
// Accent is `twitter2` — the app's accent — used on exactly one thing per
// state. `lantern` is the price-UP green: a selected preset or wallet is a
// choice, not a gain.

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Wallet01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { useFirstBuy, NO_DRAFT, FirstBuyNote, type FirstBuyTarget } from "@/hooks/use-first-buy";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { useEvmQuickBuy, presetsForSymbol } from "@/hooks/use-evm-quick-buy";
import { buyableChainId } from "@/lib/coin-feed/networks";
import { getChain } from "@/lib/chains/registry";
import { trpc } from "@/lib/trpc/client";
import { NATIVE_TOKEN } from "@/lib/chains/swap/types";
import { WalletSetupCta } from "@/components/wallet/wallet-drawer2/views/setup/wallet-setup-cta";
import { Squircle } from "@/components/ui/squircle";
import { SettingsIcon } from "@/components/icons";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { HoldButton } from "@/components/ui/hold-button";
import { cn } from "@/lib/utils";
import { compactUsd } from "./trending-format";
import { PayWithSelect, PAY_WITH_CARD, payAssetKey, unitUsd, fmtUsd, type PayAsset } from "./pay-with-select";
import { WalletPane } from "./wallet-pane";
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

/** Only what the panel draws — deliberately not the trending row type, so the
 *  coin page or a rail can mount the same panel without owning that shape. */
export type BuyPanelCoin = {
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

export type TradeSide = "buy" | "sell";


/** Selling is denominated in what you hold, so the presets are a share of it. */
const SELL_PRESETS_PCT = [25, 50, 75, 100] as const;

/**
 * A float as the string the engines want.
 *
 * `String(n)` turns 0.00000012 into "1.2e-7" and a whole memecoin position
 * into "1.234567e+21", neither of which parses as an amount. Fixed to the
 * token's own decimals (capped at 9 — more precision than that is noise in a
 * quote) with the trailing zeros trimmed.
 */
function amountString(n: number, decimals: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0";
    return n.toFixed(Math.min(Math.max(decimals, 0), 9)).replace(/\.?0+$/, "");
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

export function BuyPanel({
    coin,
    side = "buy",
    onSettled,
    onDismiss,
    firstBuy,
}: {
    coin: BuyPanelCoin;
    side?: TradeSide;
    firstBuy?: FirstBuyTarget; // a DRAFT: this buy launches it (hooks/use-first-buy)
    /** A trade landed and the success state has had its moment on screen. The
     *  dialog closes here; the card just carries on. */
    onSettled?: () => void;
    /** The flow was handed to another surface (the wallet drawer opened), so
     *  there is nothing left here to look at. */
    onDismiss?: () => void;
}) {
    const chainId = buyableChainId(coin.network);
    const chain = chainId ? getChain(chainId) : undefined;
    const isSolana = chainId === "solana";
    const isEvm = !!chain && chain.kind === "evm";
    const nativeSymbol = chain?.nativeCurrency.symbol ?? "";
    const selling = side === "sell";
    const coinSymbol = coin.symbol.replace(/^\$/, "");

    // Hooks cannot sit behind a branch, so both mount; neither does any work
    // until it is actually invoked.
    const utils = trpc.useUtils();
    const { quickBuy, buyingId: solBuyingId } = useQuickBuy();
    const { evmBuy, buyingId: evmBuyingId } = useEvmQuickBuy();
    const launch = useFirstBuy(firstBuy ?? NO_DRAFT);
    const launching = !!firstBuy && launch.launching;

    /** Contract of the token being SPENT: null = the chain's native coin. */
    const [payWith, setPayWith] = React.useState<string | null>(null);

    /** Set only once a trade actually LANDS. The button cannot infer this — the
     *  gesture completing says nothing about whether the swap filled. */
    const [succeeded, setSucceeded] = React.useState(false);

    /** Trade settings, in a popover off the amount card's corner. */
    const [slippageBps, setSlippageBpsState] = React.useState<number>(DEFAULT_SLIPPAGE_BPS);

    React.useEffect(() => {
        const saved = Number(localStorage.getItem(SLIPPAGE_KEY));
        if ((SLIPPAGE_OPTIONS as readonly number[]).includes(saved)) setSlippageBpsState(saved);
    }, []);

    const setSlippageBps = React.useCallback((v: number) => {
        setSlippageBpsState(v);
        localStorage.setItem(SLIPPAGE_KEY, String(v));
    }, []);

    // WHICH wallet is being spent from. An account can hold several linked
    // Solana wallets and `user.wallet_address` mirrors only the primary, so
    // without this the panel reads the embedded wallet while the money sits in
    // a linked extension one.
    const { wallets, active, setActive } = useActiveWallet(true);

    /** Which pane is showing. The wallet list is a PAGE, not a popover: it is a
     *  full decision with its own list, and layering it over the trade would
     *  hide the thing being paid for. */
    const [view, setView] = React.useState<"trade" | "wallets">("trade");
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
        { staleTime: 30_000, retry: false },
    );
    const evmAssets = trpc.wallet.getAllChainAssets.useQuery(undefined, {
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
     * open this with.
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

    /** The position in THIS coin, on its own chain — the only thing a sell can
     *  spend. Case-folded because EVM addresses arrive in both cases. */
    const coinHolding = React.useMemo(
        () =>
            assets.find(
                (a) =>
                    a.chain === chainId &&
                    a.contract !== null &&
                    a.contract.toLowerCase() === coin.tokenAddress.toLowerCase(),
            ),
        [assets, chainId, coin.tokenAddress],
    );

    /** The chain's own coin, priced from the holding — what a sell turns into. */
    const nativeHolding = React.useMemo(
        () => assets.find((a) => a.chain === chainId && a.contract === null),
        [assets, chainId],
    );

    // Buying falls back to the target chain's native coin, then to the largest
    // usable balance anywhere — a user holding only USDC on Base should not be
    // shown an empty SOL row they cannot spend. Selling has exactly one
    // candidate.
    const payAsset = selling
        ? coinHolding
        : payWith === PAY_WITH_CARD
          ? undefined
          : (assets.find((a) => payAssetKey(a) === payWith) ??
            assets.find((a) => a.chain === chainId && a.contract === null) ??
            assets.find((a) => !a.disabledReason));

    /** True when the money and the coin are on different chains — this routes
     *  through a bridge rather than a plain swap. Never on a sell. */
    const bridging = !selling && !!payAsset && !!chainId && payAsset.chain !== chainId;

    const payingByCard = !selling && payWith === PAY_WITH_CARD;
    const spendSymbol = selling ? coinSymbol : (payAsset?.symbol ?? nativeSymbol);
    const receiveSymbol = selling ? nativeSymbol : coinSymbol;

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
     *
     * A sell prices the position the same way, falling back to the coin's
     * listed price when the balance carries no value — the headline can still
     * read in dollars even when the wallet provider has no quote for the coin.
     */
    const unitPrice = payAsset
        ? (unitUsd(payAsset) ?? (selling ? (coin.priceUsd ?? null) : null))
        : null;
    /** Only when the spent token has a known price — a token we can't price
     *  cannot be bought in dollars, so it falls back to token presets. */
    const pricedInUsd = !!unitPrice && unitPrice > 0;

    const tokenPresets = presetsForSymbol(spendSymbol);
    const [usdAmount, setUsdAmount] = React.useState<number>(USD_PRESETS[1]);
    const [tokenAmount, setTokenAmount] = React.useState<number>(tokenPresets[1]);
    const [sellPct, setSellPct] = React.useState<number>(SELL_PRESETS_PCT[1]);

    // Restore on the client only — reading localStorage during render would
    // desync SSR and hydration. The dollar choice is remembered ACROSS tokens
    // (it means the same everywhere); the token fallback stays per-symbol.
    React.useEffect(() => {
        const savedUsd = Number(localStorage.getItem(USD_AMOUNT_KEY));
        if ((USD_PRESETS as readonly number[]).includes(savedUsd)) setUsdAmount(savedUsd);
    }, []);
    React.useEffect(() => {
        if (!spendSymbol || selling) return;
        const list = presetsForSymbol(spendSymbol);
        const saved = Number(localStorage.getItem(amountKey(spendSymbol)));
        setTokenAmount(list.includes(saved) ? saved : list[1]);
    }, [spendSymbol, selling]);

    const presets: readonly number[] = selling ? SELL_PRESETS_PCT : pricedInUsd ? USD_PRESETS : tokenPresets;
    const selectedPreset = selling ? sellPct : pricedInUsd ? usdAmount : tokenAmount;

    const setAmount = React.useCallback(
        (v: number) => {
            if (selling) {
                setSellPct(v);
                return;
            }
            if (pricedInUsd) {
                setUsdAmount(v);
                localStorage.setItem(USD_AMOUNT_KEY, String(v));
                return;
            }
            setTokenAmount(v);
            if (spendSymbol) localStorage.setItem(amountKey(spendSymbol), String(v));
        },
        [selling, pricedInUsd, spendSymbol],
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
        const dp = Math.min(payAsset?.decimals ?? 9, 9);
        if (selling) return Number((((payAsset?.balance ?? 0) * sellPct) / 100).toFixed(dp));
        if (!pricedInUsd || !unitPrice) return tokenAmount;
        return Number((usdAmount / unitPrice).toFixed(dp));
    }, [selling, sellPct, pricedInUsd, unitPrice, usdAmount, tokenAmount, payAsset?.decimals, payAsset?.balance]);
    const amountHuman = amountString(amount, payAsset?.decimals ?? 9);

    /** What the spend is worth, numerically — the headline when we can price it. */
    const spendUsdValue = selling
        ? (unitPrice ?? 0) * amount
        : pricedInUsd
          ? usdAmount
          : (unitUsd(payAsset ?? { balance: 0 }) ?? 0) * amount;
    const spendUsd = fmtUsd(spendUsdValue);

    /** How much of the pool this trade is. A large fraction moves the price
     *  against you and is hard to exit; a small one is noise. */
    const depthRatio =
        coin.liquidityUsd && coin.liquidityUsd > 0 ? spendUsdValue / coin.liquidityUsd : 0;

    // Live estimate for EVM, keyed by amount AND by what's being spent, so the
    // number on screen is the one that executes. Solana has no equivalent:
    // Jupiter returns base units with no decimals to scale them by, so the
    // figure would be a guess.
    const quote = trpc.wallet.getEvmSwapQuote.useQuery(
        {
            chain: chainId ?? "",
            fromToken: selling ? coin.tokenAddress : ((bridging ? null : payAsset?.contract) ?? NATIVE_TOKEN),
            toToken: selling ? NATIVE_TOKEN : coin.tokenAddress,
            amountHuman,
            slippageBps,
        },
        { enabled: isEvm && !bridging && !payingByCard && amount > 0, staleTime: 20_000, retry: false },
    );

    // Bridged estimate. Same role as the EVM quote above but across chains, and
    // mutually exclusive with it — exactly one of the two is ever enabled.
    const crossQuote = trpc.swap.quote.useQuery(
        {
            fromChain: payAsset?.chain ?? "",
            toChain: chainId ?? "",
            fromToken: payAsset?.contract ?? NATIVE_TOKEN,
            toToken: coin.tokenAddress,
            amountHuman,
            slippageBps,
        },
        { enabled: bridging && !payingByCard && !payAsset?.disabledReason && amount > 0, staleTime: 20_000, retry: false },
    );

    const crossSwap = trpc.swap.execute.useMutation();

    // Card funding. Asked BEFORE drawing the entry point so an unconfigured
    // deployment renders nothing rather than a button that fails on click.
    const onramp = trpc.onramp.support.useQuery(
        { chain: chainId ?? "" },
        { enabled: !!chainId && !selling, staleTime: 300_000, retry: false },
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

    const buying = solBuyingId === coin.id || evmBuyingId === coin.id || crossSwap.isPending || launching;
    // Exactly one of the two queries is ever enabled, so this is a selection,
    // not a merge. Keeping it in one place stops the receive line and the CTA
    // gate from disagreeing about which route is live.
    const activeQuote = bridging ? crossQuote : quote;
    const receive = activeQuote.data ? scaleUnits(activeQuote.data.toAmount, activeQuote.data.toDecimals) : null;

    /**
     * HOW MUCH ARRIVES — the thing actually being bought (or, selling, what
     * the position turns into).
     *
     * A real quote wins when there is one: it accounts for slippage, fees and
     * the actual route. Where there isn't — Solana same-chain, because Jupiter
     * returns base units with no decimals to scale them by — it falls back to
     * listed prices: the coin's own for a buy, the native coin's (from the
     * holding) for a sell. Marked "≈" either way, because both are estimates.
     */
    const receiveEstimate =
        receive !== null
            ? receive
            : spendUsdValue > 0
              ? selling
                  ? (() => {
                        const native = nativeHolding ? unitUsd(nativeHolding) : null;
                        return native && native > 0 ? spendUsdValue / native : null;
                    })()
                  : coin.priceUsd
                    ? spendUsdValue / coin.priceUsd
                    : null
              : null;
    const needsQuote = (isEvm || bridging) && !payingByCard;
    // You cannot spend what you do not have, and a quote for it just wastes a
    // round trip — so this gates the CTA rather than only warning.
    const overBalance =
        !payingByCard &&
        !!payAsset &&
        (!selling && pricedInUsd ? usdAmount > (payAsset.usdValue ?? 0) : amount > payAsset.balance);

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

    /** Show the filled state, then hand back. The dialog closes on `onSettled`;
     *  the card stays, so the success colour also has to let go on its own or
     *  the button would say "Bought" forever. Balances refetch either way —
     *  the position just changed. */
    const settle = () => {
        setSucceeded(true);
        void utils.wallet.getWalletAssets.invalidate();
        void utils.wallet.getAllChainAssets.invalidate();
        setTimeout(() => onSettled?.(), 1100);
        setTimeout(() => setSucceeded(false), 2400);
    };

    const onConfirm = async () => {
        // Card is funding, not a swap: it puts the native coin in the wallet,
        // and the user comes back and buys with it. Stripe cannot deliver an
        // arbitrary memecoin, so this cannot be one uninterrupted flow.
        if (payingByCard) {
            await addFunds();
            return;
        }
        // A draft's first buy is a launch, not a swap; `amount` is SOL here.
        if (firstBuy) {
            const result = await launch.firstBuy(amount);
            if (result === "no-wallet") onDismiss?.();
            else if (result === "done") settle();
            return;
        }
        if (isSolana) {
            const result = await quickBuy(
                selling
                    ? {
                          // Selling INTO SOL: the "token" the engine buys is
                          // wrapped SOL, and the market data that moved is the
                          // coin's — named so the post-trade sync hits it
                          // rather than WSOL.
                          id: coin.id,
                          tokenAddress: SOL_WSOL_MINT,
                          symbol: nativeSymbol,
                          syncMint: coin.tokenAddress,
                      }
                    : {
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
                          // hijack a trade the user aimed at the embedded wallet.
                          signWith: active?.source === "extension" ? "adapter" : "embedded",
                          signerAddress: active?.address,
                      }
                    : undefined,
            );
            // "no-wallet" already opened the wallet drawer; leaving a dialog up
            // would stack two surfaces asking for the same thing.
            if (result === "no-wallet") onDismiss?.();
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
                    amountHuman,
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
                selling
                    ? { id: coin.id, symbol: nativeSymbol, tokenAddress: NATIVE_TOKEN }
                    : { id: coin.id, symbol: coin.symbol, tokenAddress: coin.tokenAddress },
                chainId,
                amountHuman,
                selling
                    ? { token: coin.tokenAddress, symbol: coinSymbol }
                    : { token: payAsset?.contract ?? NATIVE_TOKEN, symbol: spendSymbol },
                slippageBps,
            );
            if (result === "done") settle();
        }
    };

    const tradeable = isSolana || isEvm;
    const verb = selling ? "sell" : "buy";

    // ── Swap information ────────────────────────────────────────────────────
    // What this transaction does, not what the coin is. Every line is about
    // THIS trade: the price it executes at, the least that can arrive, the
    // bound that was set, and the venue that fills it.

    /** Always "1 <what you spend> ≈ N <coin>" — a memecoin's price in SOL is
     *  0.000000x and unreadable, so a sell inverts to keep the coin on the
     *  right and the whole number on the left. */
    const rate =
        amount > 0 && receiveEstimate !== null && receiveEstimate > 0
            ? selling
                ? amount / receiveEstimate
                : receiveEstimate / amount
            : null;
    const rateLeft = selling ? nativeSymbol : spendSymbol;

    /** The floor, not the estimate: what lands even if the price moves the full
     *  slippage allowance. The quote's own figure where there is one; derived
     *  from the estimate and the bound where there isn't (Solana). */
    const atLeast = activeQuote.data?.toAmountMin
        ? scaleUnits(activeQuote.data.toAmountMin, activeQuote.data.toDecimals)
        : receiveEstimate !== null
          ? receiveEstimate * (1 - slippageBps / 10_000)
          : null;

    const route = bridging
        ? (crossQuote.data?.tool ?? "LI.FI")
        : isSolana
          ? "Jupiter"
          : (quote.data?.tool ?? "LI.FI");

    /** A sell with nothing to sell is its own state — not "no balances", which
     *  would suggest the wallet is empty, and not a disabled button with no
     *  explanation. */
    const nothingToSell = selling && !assetsLoading && !noWallet && !coinHolding;

    /** Wallet switcher, labelled with the CURRENT wallet, not "Switch wallet":
     *  an action label tells you what happens but not where you are. Shared by
     *  the trade pane and the nothing-to-sell state, since changing wallet is
     *  the one thing that fixes the latter. */
    const walletRow = (
        <div className="flex items-center justify-between gap-3">
            <span className="text-13 font-medium text-zinc-500">{selling ? "Selling from" : "Pay with"}</span>
            {active ? (
                <button
                    type="button"
                    onClick={() => setView("wallets")}
                    className="flex cursor-pointer items-center gap-1.5 text-13 font-semibold text-zinc-400 transition-colors hover:text-white"
                >
                    <HugeiconsIcon icon={Wallet01Icon} className="size-4 shrink-0" strokeWidth={2} />
                    {active.name}
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0" strokeWidth={2} />
                </button>
            ) : null}
        </div>
    );

    return (
        /* Two panes on one track: the trade, and the wallet list. Slid with
           `translateX`, not by swapping the DOM — the transform stays on the
           compositor and the outgoing pane is still there to animate, which a
           conditional render cannot do. */
        <div className="overflow-hidden">
        <div
            className="flex w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: view === "wallets" ? "translateX(-50%)" : "translateX(0)" }}
        >
        <div className="flex w-1/2 shrink-0 flex-col gap-3" aria-hidden={view !== "trade"}>
        {noWallet ? (
            /* SETUP IN PLACE, not a redirect and not a second modal. The coin
               stays on screen, so the purchase the user started is still the
               subject: they are not told to go somewhere else and come back,
               and there is nothing to dismiss. `onCreated` refetches the
               balances so this same surface continues straight into the buy. */
            <div className="flex flex-col gap-3">
                <p className="text-13 font-medium text-zinc-500">
                    You&apos;ll need a wallet to {verb} {coinSymbol}. It takes a second, and you keep the keys.
                </p>
                <WalletSetupCta
                    variant="inline"
                    onCreated={() => {
                        void utils.wallet.getAllChainAssets.invalidate();
                        void utils.wallet.getWalletAssets.invalidate();
                    }}
                />
            </div>
        ) : nothingToSell ? (
            <>
                <p className="text-13 font-medium text-zinc-500">
                    No {coinSymbol} in {active?.name ?? "this wallet"} to sell.
                </p>
                {walletRow}
            </>
        ) : tradeable ? (
            <>
                {/* The amount, as the thing the panel is actually about. */}
                <Squircle asChild radius={24}>
                <div className="flex flex-col items-center gap-3 bg-white/[0.03] p-4">
                    {/* "You're PAYING", not "buying". The big number is what
                        LEAVES the wallet, and labelling it "You're buying 1 SOL"
                        said the opposite of what happens — the coin is what's
                        being bought, SOL is what it costs. */}
                    <div className="flex w-full items-start justify-between">
                        <span className="text-13 font-medium text-zinc-500">
                            {selling ? "You're selling" : "You're paying"}
                        </span>
                        {/* A POPOVER off the card's own corner, not a swap of
                            the preset row: settings are a side errand, and
                            taking over the amount controls to show them made
                            the main thing disappear to configure it. */}
                        <GooDropdown
                            align="end"
                            width={220}
                            gap={8}
                            fill={GOO_PANEL_FILL}
                            triggerAriaLabel="Trade settings"
                            triggerClassName="-mt-1 -mr-1 cursor-pointer rounded-full p-1 text-zinc-500 transition-colors hover:text-white"
                            trigger={<SettingsIcon filled className="size-5" />}
                            items={SLIPPAGE_OPTIONS.map((bps) =>
                                gooMenuItem({
                                    key: bps,
                                    label: `${bps / 100}% slippage`,
                                    onClick: () => setSlippageBps(bps),
                                    right:
                                        bps === slippageBps ? (
                                            <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />
                                        ) : undefined,
                                }),
                            )}
                        />
                    </div>

                    {/* DOLLARS lead when we can price the token, with the token
                        amount as the conversion beneath — the same order the
                        presets are in, so the number you picked is the number
                        you see. Falls back to token-first for anything we
                        can't price. */}
                    <div className="flex flex-col items-center gap-0.5">
                        <div className="text-4xl leading-none font-bold tracking-tight tabular-nums text-white">
                            {pricedInUsd && spendUsd ? (
                                spendUsd
                            ) : (
                                <>
                                    {formatTokens(amount)}
                                    <span className="ml-1.5 text-xl font-bold text-zinc-500">{spendSymbol}</span>
                                </>
                            )}
                        </div>
                        <span className="text-13 font-medium text-zinc-500">
                            {receiveEstimate !== null
                                ? `≈ ${formatTokens(receiveEstimate)} ${receiveSymbol}`
                                : pricedInUsd
                                  ? `≈ ${formatTokens(amount)} ${spendSymbol}`
                                  : spendUsd
                                    ? `≈ ${spendUsd}`
                                    : null}
                        </span>
                    </div>

                    <div className="grid w-full grid-cols-4 gap-2">
                        {presets.map((p) => {
                            const isSelected = p === selectedPreset;
                            return (
                                // autoEffects={false}: with it on, Squircle injects a
                                // wrapper div that becomes the GRID CHILD, leaving the
                                // button inside with no width at all. These have no
                                // border for the effects to preserve, so there is
                                // nothing to trade away.
                                <Squircle asChild autoEffects={false} radius={14} key={p}>
                                <button
                                    type="button"
                                    // Compared in whatever unit the preset is in —
                                    // dollars against the holding's value, tokens
                                    // against its balance. Mixing the two was how
                                    // "$100" got disabled for a wallet holding 2 SOL.
                                    // A share of a position is always affordable.
                                    disabled={
                                        buying ||
                                        (!selling &&
                                            !!payAsset &&
                                            (pricedInUsd ? p > (payAsset.usdValue ?? 0) : p > payAsset.balance))
                                    }
                                    onClick={() => setAmount(p)}
                                    // Squircled, not a pill — owner's call. Squircle
                                    // applies the shape by clip-path, so no rounded-*.
                                    className={cn(
                                        "h-11 cursor-pointer text-15 font-bold tabular-nums transition-colors disabled:opacity-50",
                                        isSelected
                                            ? "bg-twitter2/15 text-twitter2"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                    )}
                                >
                                    {selling ? `${p}%` : pricedInUsd ? `$${p}` : p}
                                </button>
                                </Squircle>
                            );
                        })}
                    </div>
                </div>
                </Squircle>

                {/* Caption OUT of the control, sharing its row with the wallet
                    switcher. */}
                {walletRow}
                {/* What funds it. Under the amount because it changes what that
                    amount MEANS — the presets, the big number and the quote
                    all re-key off the selected token. A sell has exactly one
                    source, so there is nothing to pick. */}
                {!selling ? (
                    <PayWithSelect
                        assets={assets}
                        loading={assetsLoading}
                        selected={payWith}
                        onSelect={setPayWith}
                        targetChain={chainId ?? undefined}
                        emptyReason={emptyReason}
                        cardEnabled={!!onramp.data?.supported}
                        disabled={buying || !!firstBuy} // a launch is paid in SOL only
                    />
                ) : null}

                {/* SWAP INFORMATION — not market data. Nothing here is true of
                    the coin in general; every line is a fact about this
                    transaction at this amount. Hidden for card funding, which
                    is not a swap. */}
                {firstBuy && !payingByCard ? (
                    <FirstBuyNote symbol={coinSymbol} />
                ) : !payingByCard ? (
                    <Squircle asChild radius={24}>
                    <div className="flex flex-col gap-2 bg-white/[0.03] p-4">
                        <Row label="Rate">
                            {rate !== null ? `1 ${rateLeft} ≈ ${formatTokens(rate)} ${coinSymbol}` : "—"}
                        </Row>
                        {/* The headline above is the expectation; this is the
                            guarantee. */}
                        <Row label="At least">
                            {atLeast !== null ? `${formatTokens(atLeast)} ${receiveSymbol}` : "—"}
                        </Row>
                        <Row label="Slippage">{slippageBps / 100}%</Row>
                        <Row label="Route">{route}</Row>
                        {/* Named, because a bridge is not a swap: the source
                            receipt does not mean the funds have arrived, and
                            the wait is real. Better seen before the hold. */}
                        {bridging ? (
                            <Row label="Bridge">
                                {payAsset?.chain} → {chainId}
                            </Row>
                        ) : null}
                        {/* DEPTH, only when it is worth saying. Under 2% of a
                            pool is noise, and a permanent line would train
                            people to ignore it; above it the price will move
                            against this trade, which is a fact about the trade. */}
                        {depthRatio > 0.02 ? (
                            <p
                                className={cn(
                                    "pt-1 text-13 font-medium leading-snug",
                                    depthRatio > 0.05 ? "text-pastelred" : "text-sunset",
                                )}
                            >
                                This is {(depthRatio * 100).toFixed(0)}% of the pool
                                {coin.liquidityUsd ? ` (${compactUsd(coin.liquidityUsd)} liquidity)` : ""} — expect
                                the price to move against you.
                            </p>
                        ) : null}
                    </div>
                    </Squircle>
                ) : null}

                {needsQuote && activeQuote.error ? (
                    <p className="text-13 font-medium text-pastelred">{activeQuote.error.message}</p>
                ) : null}
                {crossSwap.error ? (
                    <p className="text-13 font-medium text-pastelred">{crossSwap.error.message}</p>
                ) : null}

                {/* HOLD, not click. This button spends real money, where a
                    mis-tap used to be one click from an unwanted trade. The
                    label says "Hold" because a button that ignores taps and
                    explains nothing reads as broken.

                    SQUIRCLED, not a pill — owner call. The Squircle wraps
                    rather than being applied via asChild because HoldButton is
                    a component, not an element, and asChild clones an
                    element's props.

                    THREE states, owner's palette: a neutral white/30 rest, a
                    twitter/55 sweep as the hold fills, and `long` once it
                    lands. The success state restyles the WHOLE button rather
                    than sweeping, which is also why it can flip the text to
                    black — white on #33FDA1 is about 1.4:1 and unreadable,
                    while white is fine on both of the other two. */}
                <Squircle asChild radius={16}>
                <div className="w-full">
                <HoldButton
                    onConfirm={() => void onConfirm()}
                    disabled={
                        buying ||
                        needsExtension ||
                        overBalance ||
                        amount <= 0 ||
                        (needsQuote && !activeQuote.data) ||
                        (payingByCard && fundSession.isPending)
                    }
                    succeeded={succeeded}
                    fillClassName="bg-twitter/55"
                    successClassName="h-14 w-full bg-long text-base font-bold text-black"
                    className="h-14 w-full cursor-pointer bg-white/30 text-base font-bold text-white hover:bg-white/35 disabled:opacity-50"
                >
                    {succeeded
                        ? selling
                            ? "Sold"
                            : "Bought"
                        : needsExtension
                          ? `Connect ${active?.name ?? "that wallet"} to spend from it`
                          : buying
                            ? launching
                                ? "Launching…"
                                : selling
                                  ? "Selling…"
                                  : "Buying…"
                            : overBalance
                              ? `Not enough ${spendSymbol}`
                              : firstBuy
                                ? `Hold to buy ${pricedInUsd && spendUsd ? spendUsd : `${formatTokens(amount)} SOL`} · first buy`
                              : payingByCard
                                ? fundSession.isPending
                                    ? "Opening…"
                                    : `Hold to add ${nativeSymbol} with card`
                                : pricedInUsd && spendUsd
                                  ? `Hold to ${verb} ${spendUsd} of ${coinSymbol}`
                                  : `Hold to ${verb} ${formatTokens(amount)} ${spendSymbol}`}
                </HoldButton>
                </div>
                </Squircle>

                {fundSession.error ? (
                    <p className="text-13 font-medium text-pastelred">{fundSession.error.message}</p>
                ) : null}
            </>
        ) : (
            // On the board but not in the wallet registry: we can show this
            // coin and cannot hold its chain's keys. Say so, rather than
            // sending the user off-site to do it themselves.
            <p className="text-13 font-medium text-zinc-500">
                {coin.network} isn&apos;t tradeable in-app yet — no wallet on that chain.
            </p>
        )}
        </div>

        <WalletPane
            wallets={wallets}
            activeAddress={active?.address}
            onBack={() => setView("trade")}
            onPick={(address) => {
                setActive(address);
                // Straight back — choosing IS the action, so a second
                // confirming tap would be ceremony.
                setView("trade");
            }}
            hidden={view !== "wallets"}
        />
        </div>
        </div>
    );
}
