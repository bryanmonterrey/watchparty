import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon } from "@/components/icons";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { ChainIcon } from "@/components/wallet/chain-icon";
import { getChainOrDefault } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";

interface WalletHeaderProps {
    username: string;
    avatarUrl: string;
    walletAddress?: string;
    onSettingsClick: () => void;
    onChangeWallet?: () => void;
    onSignOut: () => void;
    loading?: boolean;
    activeChain: ChainId;
    onNetworkClick: () => void;
}

export function WalletHeader({
    username,
    avatarUrl,
    walletAddress,
    onSettingsClick,
    onChangeWallet,
    onSignOut,
    loading,
    activeChain,
    onNetworkClick,
}: WalletHeaderProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
            setIsOpen(false);
        }
    };

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-[#080808] relative">
            <div className="flex items-center gap-3 rounded-xl">
                <div className="rounded-full overflow-hidden h-10 w-10 shrink-0">
                    {loading ? (
                        <div className="h-10 w-10 rounded-full shimmer-skeleton" />
                    ) : (
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                            <AvatarFallback></AvatarFallback>
                        </Avatar>
                    )}
                </div>
                <div className="flex flex-col">
                    {loading ? (
                        <div className="flex flex-col gap-1.5">
                            <div className="h-4 w-24 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-32 rounded-full shimmer-skeleton" />
                        </div>
                    ) : (
                        <>
                            <p className="text-base font-bold text-white">{username}</p>
                            <p className="text-xs font-medium text-zinc-400">{shortenWalletAddress(walletAddress || "")}</p>
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 relative">
                {/* Network switcher. Icon-only so three controls still fit the
                    row; the active chain reads at a glance from its brand mark. */}
                <button
                    onClick={onNetworkClick}
                    aria-label={`network: ${getChainOrDefault(activeChain).name}`}
                    title={getChainOrDefault(activeChain).name}
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black transition-colors hover:bg-input1"
                >
                    <ChainIcon chain={activeChain} size={26} />
                </button>

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
