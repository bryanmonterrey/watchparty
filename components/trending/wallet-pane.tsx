"use client";

// The buy panel's second page: which wallet pays. A PAGE, not a popover — it is
// a full decision with its own list, and layering it over the trade would hide
// the thing being paid for. The panel slides it in on a shared track; this
// file only draws the list.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { cn, shortenWalletAddress } from "@/lib/utils";

export type WalletPaneWallet = {
    id: string;
    name: string;
    address: string;
    isPrimary?: boolean;
};

export function WalletPane({
    wallets,
    activeAddress,
    onBack,
    onPick,
    hidden,
}: {
    wallets: readonly WalletPaneWallet[];
    activeAddress?: string;
    onBack: () => void;
    onPick: (address: string) => void;
    /** Off-screen on the track; kept in the DOM so it can animate. */
    hidden: boolean;
}) {
    return (
        <div className="flex w-1/2 shrink-0 flex-col gap-3" aria-hidden={hidden}>
            <button
                type="button"
                onClick={onBack}
                className="flex w-fit cursor-pointer items-center gap-1.5 text-13 font-semibold text-zinc-400 transition-colors hover:text-white"
            >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
                Back
            </button>

            <div className="flex flex-col gap-1">
                {wallets.map((w) => {
                    const isActive = activeAddress === w.address;
                    return (
                        <Squircle asChild radius={16} key={w.id}>
                            <button
                                type="button"
                                onClick={() => onPick(w.address)}
                                className={cn(
                                    "flex h-14 w-full cursor-pointer items-center gap-3 px-3.5 text-left transition-colors",
                                    isActive
                                        ? "bg-twitter2/12 text-twitter2"
                                        : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                                )}
                            >
                                <HugeiconsIcon icon={Wallet01Icon} className="size-5 shrink-0" strokeWidth={2} />
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-15 font-bold">{w.name}</span>
                                    {/* The address is what actually distinguishes
                                        two wallets that share a source name.
                                        Through the canonical shortener — the one
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
    );
}
