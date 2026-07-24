import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon } from "@/components/icons";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown } from "@/components/ui/goo-dropdown";

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

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
            setIsOpen(false);
        }
    };

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-gray1 relative">
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
                            <p className="text-lg font-semibold text-white">{username}</p>
                            <p className="text-sm font-medium text-zinc-400">{shortenWalletAddress(walletAddress || "")}</p>
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 relative">
                <Button
                    className="size-9 p-0 glass-ring rounded-full bg-black hover:bg-black/50 transition-colors"
                    onClick={onSettingsClick}
                >
                    <SettingsIcon className="w-5 h-5 text-zinc-400" />
                </Button>

                <GooDropdown
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    align="end"
                    width={208}
                    gap={8}
                    triggerAriaLabel="Wallet session"
                    triggerClassName={`flex size-9 items-center justify-center glass-ring rounded-full transition-colors ${isOpen ? "bg-zinc-700/70 text-white" : "bg-black hover:bg-black/50 text-zinc-400"}`}
                    trigger={<PowerIcon className="w-5 h-5" />}
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
