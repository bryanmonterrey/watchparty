"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon } from "@/components/icons";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import {
    MorphPopover,
    MorphPopoverContent,
    MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { trpc } from "@/lib/trpc/client";

interface WalletHeaderProps {
    username: string;
    avatarUrl: string;
    walletAddress?: string;
    onSettingsClick: () => void;
    onChangeWallet?: () => void;
    onSignOut: () => void;
    loading?: boolean;
}

export function WalletHeader({
    username,
    avatarUrl,
    walletAddress,
    onSettingsClick,
    onChangeWallet,
    onSignOut,
    loading,
}: WalletHeaderProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [accountOpen, setAccountOpen] = React.useState(false);

    const utils = trpc.useUtils();
    // Only fetched once the account popover is opened — the header shouldn't pay
    // for a wallet list nobody has asked to see.
    const { data: linked } = trpc.wallet.listLinkedWallets.useQuery(undefined, {
        enabled: accountOpen,
        staleTime: 60_000,
    });
    const setPrimary = trpc.wallet.setPrimaryWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("primary wallet updated");
            setAccountOpen(false);
        },
        onError: (e) => appToast.error(e.message),
    });

    const wallets = linked?.wallets ?? [];

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
            setIsOpen(false);
        }
    };

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-canvas relative">
            {/* The account row is its own popover — the wallet switcher, modelled
                on the wallet-card block's account trigger. It is deliberately NOT
                the session menu: those actions stay on the power button.

                MorphPopover rather than GooDropdown here. Goo is the standard for
                menus of rows; this panel is a switcher with its own header and
                per-wallet layout, which is what the morph primitive is for. */}
            {loading ? (
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full shimmer-skeleton" />
                    <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-24 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-32 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            ) : (
                <MorphPopover open={accountOpen} onOpenChange={setAccountOpen}>
                    <MorphPopoverTrigger>
                        <button
                            aria-label="Switch wallet"
                            // -ml-2 pulls the avatar back to the card's content
                            // edge, so it still lines up with the balance below
                            // despite the trigger's own padding.
                            className={`-ml-2 flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors ${accountOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                        >
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                                <AvatarFallback></AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-col items-start">
                                <p className="truncate text-base font-bold text-white">{username}</p>
                                <p className="text-xs font-medium text-zinc-400">{shortenWalletAddress(walletAddress || "")}</p>
                            </div>
                            <ChevronDown
                                className={`size-4 shrink-0 text-zinc-500 transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`}
                            />
                        </button>
                    </MorphPopoverTrigger>

                    <MorphPopoverContent
                        side="bottom"
                        align="start"
                        radius={24}
                        fill="#111111ff"
                        className="w-[264px] p-1.5"
                    >
                        <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-zinc-500">
                            your wallets
                        </p>
                        {wallets.length === 0 ? (
                            <div className="px-3 pb-3 pt-1 text-sm font-medium text-zinc-500">
                                loading…
                            </div>
                        ) : (
                            <ul className="max-h-64 overflow-y-auto">
                                {wallets.map((w) => {
                                    // Labelled by name and source, never by address —
                                    // same house rule linked-wallets-panel follows.
                                    const isEmbedded = w.source === "swig";
                                    return (
                                        <li key={w.id}>
                                            <button
                                                onClick={() => {
                                                    if (w.isPrimary) { setAccountOpen(false); return; }
                                                    setPrimary.mutate({ address: w.address });
                                                }}
                                                disabled={setPrimary.isPending}
                                                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${w.isPrimary ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                                            >
                                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                                                    <WalletIcon className="size-4 text-zinc-400" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-white">
                                                        {w.label || (isEmbedded ? "watchparty wallet" : "connected wallet")}
                                                    </span>
                                                    <span className="block text-xs font-medium text-zinc-500">
                                                        {w.isPrimary ? "primary" : "tap to make primary"}
                                                    </span>
                                                </span>
                                                {w.isPrimary && <Check className="size-4 shrink-0 text-white" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </MorphPopoverContent>
                </MorphPopover>
            )}

            <div className="flex items-center gap-1 relative">
                <Button
                    variant="ghost"
                    className="group bg-black hover:bg-input1 text-flexwhite transition-colors rounded-full"
                    onClick={onSettingsClick}
                >
                    {/* size-* (NOT w-/h-): the Button clamps any svg without a
                        `size-` class to size-4 via [&_svg:not([class*='size-'])]:size-4,
                        which is why w-7 h-7 wasn't taking. Change this number to resize.
                        Add `filled` to <SettingsIcon> for the solid gear variant. */}
                    {/* group-hover (not hover): the icon fills transparent gaps, so
                        hovering the Button — marked `group` above — recolors it, not
                        only a direct hover on the gear itself. */}
                    <SettingsIcon filled className="size-6 text-flexwhite/50 group-hover:text-white transition-colors" />
                </Button>

                <GooDropdown
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    align="end"
                    width={208}
                    gap={8}
                    triggerAriaLabel="Wallet session"
                    triggerClassName={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${isOpen ? "bg-input1 text-white" : "bg-black text-flexwhite/50 hover:text-white"}`}
                    trigger={<PowerIcon className="w-6 h-6" strokeWidth={2} />}
                    items={[
                        {
                            key: "copy",
                            onClick: handleCopyAddress,
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                            label: (
                                <>
                                    <CopyIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                    Copy Address
                                </>
                            ),
                        },
                        {
                            key: "change-wallet",
                            onClick: () => onChangeWallet?.(),
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                            label: (
                                <>
                                    <WalletIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                    Change Wallet
                                </>
                            ),
                        },
                        {
                            key: "disconnect",
                            onClick: onSignOut,
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-red-400/90 hover:bg-red-500/10 hover:text-red-400",
                            label: (
                                <>
                                    <LogoutIcon className="w-5 h-5 shrink-0" />
                                    Disconnect
                                </>
                            ),
                        },
                    ]}
                />
            </div>
        </div>
    );
}
