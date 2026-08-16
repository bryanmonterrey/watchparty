"use client";

// "What do you want to pay with" — the row under the amount in the buy dialog.
//
// The buy used to assume the chain's native coin: SOL on Solana, ETH on Base.
// That is the one asset a user is least likely to be holding spare, and both
// swap paths have always accepted any input token — Jupiter routes from any
// mint, and LI.FI takes an ERC-20 and handles the allowance. The restriction
// was in the UI, not the engine.
//
// Card sits in the same list rather than off to the side, because "how am I
// paying for this" is one question with one answer. Apple Pay is intended to
// join it and is deliberately NOT stubbed here — a disabled row that never
// works is worse than a row that appears the day it does.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, CreditCardIcon } from "@hugeicons/core-free-icons";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { Squircle } from "@/components/ui/squircle";
import { CoinImage } from "@/components/coins/coin-image";
import { cn } from "@/lib/utils";

/** One spendable balance, normalised from the two different shapes the wallet
 *  returns (Solana's Helius path and the per-chain asset providers). */
export type PayAsset = {
    /** Contract / mint. Null means the chain's native coin. */
    contract: string | null;
    symbol: string;
    decimals: number;
    balance: number;
    usdValue?: number;
    icon?: string;
};

/** Sentinel for the card row — not a contract, so it can never collide with one. */
export const PAY_WITH_CARD = "__card__";

/** Compact balances: a dust position and a whole-number one both have to read
 *  at a glance in a 90px slot. */
function fmtBalance(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

export function PayWithSelect({
    assets,
    loading,
    selected,
    onSelect,
    cardEnabled,
    disabled,
}: {
    assets: PayAsset[];
    loading?: boolean;
    /** A contract address, null for native, or PAY_WITH_CARD. */
    selected: string | null;
    onSelect: (value: string | null) => void;
    cardEnabled?: boolean;
    disabled?: boolean;
}) {
    const isCard = selected === PAY_WITH_CARD;
    const current = isCard ? null : assets.find((a) => a.contract === selected) ?? assets[0];

    const items = [
        ...assets.map((a) =>
            gooMenuItem({
                key: a.contract ?? "native",
                label: a.symbol,
                icon: (
                    <CoinImage
                        src={a.icon}
                        alt={a.symbol}
                        coin={a.contract ?? a.symbol}
                        className="size-6 rounded-full"
                    />
                ),
                right: (
                    <span className="text-13 font-semibold tabular-nums text-zinc-500">
                        {fmtBalance(a.balance)}
                    </span>
                ),
                onClick: () => onSelect(a.contract),
            }),
        ),
        ...(cardEnabled
            ? [
                  gooMenuItem({
                      key: "card",
                      label: "Card",
                      icon: <HugeiconsIcon icon={CreditCardIcon} className="size-6" strokeWidth={2} />,
                      onClick: () => onSelect(PAY_WITH_CARD),
                  }),
              ]
            : []),
    ];

    return (
        <GooDropdown
            align="start"
            width={320}
            gap={8}
            fill={GOO_PANEL_FILL}
            disabled={disabled || (!loading && items.length === 0)}
            triggerAriaLabel="Choose what to pay with"
            // The button itself stays transparent and full width; the SQUIRCLE
            // lives on its content. Wrapping the dropdown instead would clip
            // the panel too, which renders as a sibling and is not portaled.
            triggerClassName="w-full cursor-pointer"
            trigger={
                <Squircle asChild radius={20}>
                    <div className="flex h-14 w-full items-center gap-3 bg-white/[0.03] px-4 transition-colors hover:bg-white/[0.06]">
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
                            <span className="truncate text-15 font-bold text-white">
                                {isCard ? "Card" : loading && !current ? "…" : current?.symbol ?? "No balance"}
                            </span>
                        </span>

                        {!isCard && current ? (
                            <span className="ml-auto shrink-0 text-13 font-semibold tabular-nums text-zinc-500">
                                {fmtBalance(current.balance)}
                            </span>
                        ) : null}

                        <HugeiconsIcon
                            icon={ArrowDown01Icon}
                            className={cn("size-5 shrink-0 text-zinc-500", isCard || !current ? "ml-auto" : "")}
                            strokeWidth={2}
                        />
                    </div>
                </Squircle>
            }
            items={items}
        />
    );
}
