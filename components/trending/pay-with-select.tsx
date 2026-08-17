"use client";

// "What do you want to pay with" — the row under the amount in the buy dialog.
//
// The buy used to assume the chain's native coin: SOL on Solana, ETH on Base.
// That is the one asset a user is least likely to be holding spare, and both
// swap paths have always accepted any input — Jupiter routes from any mint, and
// LI.FI takes an ERC-20 and handles the allowance. The restriction was in the
// UI, not the engine.
//
// Card sits in the same list rather than off to the side, because "how am I
// paying for this" is one question with one answer. Apple Pay is intended to
// join it and is deliberately NOT stubbed — a disabled row that never works is
// worse than a row that appears the day it does.
//
// AN ACCORDION, not a dropdown (owner call: transitions.dev/accordion). It
// expands in place inside the dialog rather than opening a floating panel, so
// the house "every dropdown is a GooDropdown" rule doesn't apply — there is no
// popover here. Motion lives in globals.css as `.t-acc*`; see the note there.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CreditCardIcon } from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { CoinImage } from "@/components/coins/coin-image";
import { ChainBadge } from "./chain-badge";
import { cn } from "@/lib/utils";

/** One spendable balance, normalised from the two different shapes the wallet
 *  returns (Solana's Helius path and the per-chain asset providers). */
export type PayAsset = {
    /** Registry chain id this balance lives on. */
    chain: string;
    /** Contract / mint. Null means the chain's native coin. */
    contract: string | null;
    symbol: string;
    decimals: number;
    balance: number;
    usdValue?: number;
    icon?: string;
    /** Set when this balance exists but cannot fund THIS purchase — shown in
     *  place of the balance so the row explains itself instead of vanishing. */
    disabledReason?: string;
};

/** Assets are keyed by chain AND contract: native is `null` on every chain, and
 *  the same stablecoin contract address recurs across EVM chains, so a
 *  contract-only key silently collapses different balances into one row. */
export const payAssetKey = (a: { chain: string; contract: string | null }) =>
    `${a.chain}:${a.contract ?? "native"}`;

/** Sentinel for the card row — not a contract, so it can never collide with one. */
export const PAY_WITH_CARD = "__card__";

/**
 * What one unit is worth, derived from the holding itself.
 *
 * `usdValue` is the value of the WHOLE balance, so the unit price falls out of
 * dividing by it — no price query, and it is guaranteed consistent with the
 * balance shown right next to it. Null when there is nothing to divide.
 */
export function unitUsd(a: { balance: number; usdValue?: number }): number | null {
    if (!a.usdValue || !a.balance || a.balance <= 0) return null;
    const per = a.usdValue / a.balance;
    return Number.isFinite(per) ? per : null;
}

/** Whole dollars above $1, cents below — "$0" for a real 40-cent holding is
 *  the kind of rounding that makes a balance look empty. */
export function fmtUsd(n: number | null | undefined): string | null {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
    if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(n >= 0.01 ? 2 : 4)}`;
}

/** Compact balances: a dust position and a whole-number one both have to read
 *  at a glance in a narrow slot. */
function fmtBalance(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

/**
 * The chevron, inline rather than from HugeIcons.
 *
 * `.t-acc-chevron` flips it with `scaleY(-1)` about the element's centre, so
 * the path has to be symmetric about the viewBox centre for the "v" to land on
 * a clean "^". This is the source component's own path, kept verbatim for that
 * reason — the motion depends on the geometry. `vector-effect` is applied by
 * the stylesheet so the stroke width survives the flip.
 */
function AccChevron() {
    return (
        <span className="t-acc-chevron shrink-0 text-zinc-500">
            <svg
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
            >
                <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
        </span>
    );
}

function OptionRow({
    icon,
    label,
    badge,
    right,
    active,
    disabled,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    badge?: React.ReactNode;
    right?: React.ReactNode;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <Squircle asChild radius={14}>
            <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                className={cn(
                    "flex h-11 w-full items-center gap-2.5 px-3 text-left transition-colors",
                    disabled
                        ? "cursor-default text-zinc-600"
                        : active
                          ? "cursor-pointer bg-lantern/12 text-lantern"
                          : "cursor-pointer text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                )}
            >
                {icon}
                <span className="truncate text-15 font-bold">{label}</span>
                {badge}
                {right ? <span className="ml-auto shrink-0">{right}</span> : null}
            </button>
        </Squircle>
    );
}

export function PayWithSelect({
    assets,
    loading,
    selected,
    onSelect,
    targetChain,
    cardEnabled,
    disabled,
    emptyReason,
}: {
    assets: PayAsset[];
    loading?: boolean;
    /** A `payAssetKey`, or PAY_WITH_CARD. */
    selected: string | null;
    onSelect: (value: string | null) => void;
    /** The chain being bought on — rows on any other chain are labelled, since
     *  those route through a bridge and that is worth seeing before committing. */
    targetChain?: string;
    cardEnabled?: boolean;
    disabled?: boolean;
    /** Why the list is empty, when it is. "No balances" was being shown for
     *  three different reasons — none, unloadable, and no wallet — which is
     *  what made the last round undiagnosable from the screen alone. */
    emptyReason?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const isCard = selected === PAY_WITH_CARD;
    const current = isCard
        ? null
        : assets.find((a) => payAssetKey(a) === selected) ?? assets.find((a) => !a.disabledReason);
    const empty = !loading && assets.length === 0 && !cardEnabled;
    const bridging = !!current && !!targetChain && current.chain !== targetChain;

    const choose = (value: string | null) => {
        onSelect(value);
        setOpen(false);
    };

    // Close on an outside press or Escape.
    //
    // The panel OVERLAYS the dialog's own content, so without this the only way
    // out was re-pressing the header — and anything the panel covered (the
    // details card, the buy button) looked clickable while being unreachable.
    //
    // `pointerdown`, not `click`: the press should dismiss before whatever is
    // underneath receives it, so the first tap outside closes the panel instead
    // of also actioning the control it landed on.
    const rootRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        // Capture phase so a stopPropagation inside the dialog can't strand the
        // panel open.
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        // The outer box is `relative` and NOT squircled: the panel below is
        // absolutely positioned, and a clip-path here would cut it off at the
        // header's bounds. Each part carries its own squircle instead.
        <div ref={rootRef} className="t-acc relative w-full" data-open={open && !disabled && !empty}>
            <Squircle asChild radius={20}>
                <div className="w-full bg-white/[0.03]">
                <button
                    type="button"
                    disabled={disabled || empty}
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className="flex h-14 w-full cursor-pointer items-center gap-3 px-4 transition-colors hover:bg-white/[0.03] disabled:cursor-default disabled:opacity-50"
                >
                    {isCard ? (
                        <HugeiconsIcon
                            icon={CreditCardIcon}
                            className="size-6 shrink-0 text-white"
                            strokeWidth={2}
                        />
                    ) : current ? (
                        <CoinImage
                            src={current.icon}
                            alt={current.symbol}
                            coin={current.contract ?? current.symbol}
                            className="size-6 shrink-0 rounded-full"
                        />
                    ) : null}

                    <span className="flex min-w-0 flex-col items-start">
                        <span className="text-13 font-medium text-zinc-500">Pay with</span>
                        <span className="flex items-center gap-1.5">
                            <span className="truncate text-15 font-bold text-white">
                                {isCard
                                    ? "Card"
                                    : loading && !current
                                      ? "…"
                                      : (current?.symbol ?? emptyReason ?? "No balances")}
                            </span>
                            {/* Only when it differs: a badge on every row would
                                be noise, but a bridged source has to be visible
                                before the hold, not after. */}
                            {bridging && current ? (
                                <ChainBadge network={current.chain} className="size-3.5 shrink-0" />
                            ) : null}
                        </span>
                    </span>

                    <span className="ml-auto flex shrink-0 items-center gap-2">
                        {!isCard && current ? (
                            <span className="flex items-baseline gap-2">
                                <span className="text-13 font-semibold tabular-nums text-white">
                                    {fmtBalance(current.balance)}
                                </span>
                                {fmtUsd(current.usdValue) ? (
                                    <span className="text-13 font-medium tabular-nums text-zinc-500">
                                        {fmtUsd(current.usdValue)}
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                        <AccChevron />
                    </span>
                </button>

                </div>
            </Squircle>

            {/* OVERLAYS the content beneath instead of displacing it.
                Expanding in flow grew the whole dialog as the list opened,
                which is wrong for a picker: the modal must be one size whether
                or not you are choosing. `absolute` keeps the grid-rows reveal
                (still no measured heights) while taking zero layout space. */}
            <div className="t-acc-panel absolute inset-x-0 top-full z-30 mt-1">
                <div className="t-acc-panel-inner">
                    <Squircle asChild radius={20}>
                        {/* Solid, not translucent: it sits over the details card
                            and the CTA, which must not read through it. */}
                        <div className="border border-white/10 bg-[#141414]">
                        <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
                            {!loading && assets.length === 0 ? (
                                <p className="px-3 py-2 text-13 font-medium text-zinc-500">
                                    {emptyReason
                                        ? `${emptyReason}.`
                                        : "Nothing to spend yet — add funds to a chain and it'll show here."}
                                </p>
                            ) : null}

                            {assets.map((a) => {
                                const key = payAssetKey(a);
                                const offChain = !!targetChain && a.chain !== targetChain;
                                return (
                                    <OptionRow
                                        key={key}
                                        active={!isCard && current ? payAssetKey(current) === key : false}
                                        disabled={!!a.disabledReason}
                                        onClick={() => choose(key)}
                                        icon={
                                            <CoinImage
                                                src={a.icon}
                                                alt={a.symbol}
                                                coin={a.contract ?? a.symbol}
                                                className="size-6 shrink-0 rounded-full"
                                            />
                                        }
                                        label={a.symbol}
                                        badge={
                                            offChain ? (
                                                <ChainBadge network={a.chain} className="size-3.5 shrink-0" />
                                            ) : undefined
                                        }
                                        right={
                                            a.disabledReason ? (
                                                <span className="text-13 font-semibold text-zinc-500">
                                                    {a.disabledReason}
                                                </span>
                                            ) : (
                                                // Amount and worth, stacked: the
                                                // count answers "can I afford
                                                // this", the dollars answer "is
                                                // it worth using".
                                                <span className="flex items-baseline gap-2">
                                                    <span className="text-13 font-semibold tabular-nums text-white">
                                                        {fmtBalance(a.balance)}
                                                    </span>
                                                    {fmtUsd(a.usdValue) ? (
                                                        <span className="text-13 font-medium tabular-nums text-zinc-500">
                                                            {fmtUsd(a.usdValue)}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            )
                                        }
                                    />
                                );
                            })}

                            {cardEnabled ? (
                                <OptionRow
                                    active={isCard}
                                    onClick={() => choose(PAY_WITH_CARD)}
                                    icon={
                                        <HugeiconsIcon
                                            icon={CreditCardIcon}
                                            className="size-6 shrink-0"
                                            strokeWidth={2}
                                        />
                                    }
                                    label="Card"
                                />
                            ) : null}
                        </div>
                        </div>
                    </Squircle>
                </div>
            </div>
        </div>
    );
}
